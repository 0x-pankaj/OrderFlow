use anchor_lang::prelude::*;
use anchor_spl::{token_interface::{self as token_interface,  Mint, TokenInterface, TokenAccount }};
use crate::states::{Order, OrderStatus};
use crate::events::{OrderFilled, OrderCreated, OrderCancelled, CancelledBy};


pub mod errors;
pub mod states;
pub mod events;

declare_id!("ApiiyCyQ6AN4jE8NHNEbcdfY3MoFrZvwebukxyWWBJ6N");

pub const JUPITER_PROGRAM_ID: Pubkey = pubkey!("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
pub const BACKEND_AUTHORITY_PUBKEY: Pubkey = pubkey!("Fh8Y5W3v6T7k9rXo3K1i3b1L6Z1J5Y5Z5Y5Z5Y5Z5Y5Z");

#[program]
pub mod orderflow_contract {
    use anchor_lang::prelude::{instruction::Instruction, program::invoke_signed};

    use crate::errors::OrderFlowError;

    use super::*;

    pub fn initialize_order(
        ctx: Context<InitializeOrder>,
        unique_id: u64,
        making_amount: u64,
        taking_amount: u64,
        expired_at: i64,
    ) -> Result<()> {
        require!(making_amount > 0, errors::OrderFlowError::MakingAmountCannotBeZero);
        require!(taking_amount > 0, errors::OrderFlowError::TakingAmountCannotBeZero);
        let clock = Clock::get()?;
        require!(expired_at > clock.unix_timestamp, errors::OrderFlowError::ExpiredAtMustBeFuture);


        let order = &mut ctx.accounts.order;

        order.maker = ctx.accounts.maker.key();
        order.input_mint = ctx.accounts.input_mint.key();
        order.output_mint = ctx.accounts.output_mint.key();
        order.making_amount = making_amount;
        order.taking_amount = taking_amount;
        order.ori_making_amount = making_amount;
        order.ori_taking_amount = taking_amount;
        order.expired_at = expired_at;
        order.created_at = clock.unix_timestamp;
        order.updated_at = clock.unix_timestamp;
        order.status = states::OrderStatus::Open;

        order.unique_id = unique_id;
        order.bump = ctx.bumps.order;


        //transfering token from maker ata to ata owned by escrow (order account)

        let cpi_accounts = token_interface::TransferChecked{
            from: ctx.accounts.maker_input_mint_account.to_account_info(),
            mint: ctx.accounts.input_mint.to_account_info(),
            to: ctx.accounts.input_mint_reserve.to_account_info(),
            authority: ctx.accounts.maker.to_account_info(),
        };

        let cpi_program = ctx.accounts.input_token_program.to_account_info();

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        token_interface::transfer_checked(cpi_ctx, making_amount, ctx.accounts.input_mint.decimals)?;


        //emit event
        emit!(OrderCreated{
            order_key: order.key(),
            maker: order.maker,
            input_mint: order.input_mint,
            output_mint: order.output_mint,
            making_amount: order.making_amount,
            taking_amount: order.taking_amount,
            expired_at: order.expired_at,
            created_at: order.created_at,
            unique_id: order.unique_id
        });



        Ok(())
    }

    pub fn fill_order(
        ctx: Context<FillOrder>,
        jupiter_swap_data: Vec<u8>,
        min_expected_taking_amount: u64
    ) -> Result<()> {


        let order = &mut ctx.accounts.order;


        let input_reserve_before = ctx.accounts.input_mint_reserve.amount;
        let maker_output_before = ctx.accounts.maker_output_account.amount;


        let accounts: Vec<AccountMeta> = ctx.remaining_accounts.iter().map(|acc| AccountMeta {
            pubkey: *acc.key,
            is_signer: false,
            is_writable: acc.is_writable
        }).collect();

        let maker_key   = order.maker;
        let unique_id_bytes = order.unique_id.to_le_bytes();
        let bump = order.bump;

        let signers_seeds = &[b"order", maker_key.as_ref(), unique_id_bytes.as_ref(), &[bump]];


        //executing jupiter swap
        invoke_signed(&Instruction {
            program_id: ctx.accounts.jupiter_program.key(),
            accounts,
            data: jupiter_swap_data.clone(),

        }, ctx.remaining_accounts, &[signers_seeds])?;


        //reloading accounts to get updated balance 
        ctx.accounts.input_mint_reserve.reload()?;
        ctx.accounts.maker_output_account.reload()?;


        let input_reserve_after = ctx.accounts.input_mint_reserve.amount;
        let maker_output_after = ctx.accounts.maker_output_account.amount;
        

        let making_amount_filled = input_reserve_before.checked_sub( input_reserve_after).ok_or(OrderFlowError::MathOverflow)?;
        let taking_amount_filled = maker_output_before.checked_sub(maker_output_after).ok_or(OrderFlowError::MathOverflow)?;

        require!(making_amount_filled > 0, OrderFlowError::NoSwapOccurred);
        require!(taking_amount_filled > 0, OrderFlowError::NoSwapOccurred);

        //enforcing slippage 
        require!(
            taking_amount_filled >= min_expected_taking_amount,
            OrderFlowError::SlippageTooHigh
        );

        //updating order amount 

        order.making_amount = order.making_amount.checked_sub(making_amount_filled).ok_or(OrderFlowError::MathOverflow)?;


        order.taking_amount = order.taking_amount.checked_sub(taking_amount_filled).ok_or(OrderFlowError::MathOverflow)?;


        order.updated_at = Clock::get()?.unix_timestamp;

        let is_filled = order.making_amount == 0 || order.taking_amount == 0;
        if is_filled {
            order.status = OrderStatus::Filled;
        }

        //emiting event
        emit!(OrderFilled {
            order_key: order.key(),
            maker: order.maker,
            making_amount_filled,
            taking_amount_filled,
            remaining_making_amount: order.making_amount,
            remaining_taking_amount: order.taking_amount,
            is_filled,
            filled_at: order.updated_at
        });

        Ok(())
    }

    pub fn cancel_order(
    ctx: Context<CancelOrder>,
) -> Result<()> {

    // Extract values before mutable borrow
    let order_status = ctx.accounts.order.status;
    let order_maker = ctx.accounts.order.maker;
    let order_expired_at = ctx.accounts.order.expired_at;
    let order_making_amount = ctx.accounts.order.making_amount;
    let order_unique_id = ctx.accounts.order.unique_id;
    let order_bump = ctx.accounts.order.bump;
    let input_mint_decimals = ctx.accounts.input_mint.decimals;

    // Verify order status
    require!(order_status == OrderStatus::Open, OrderFlowError::OrderExpired);

    let is_maker = ctx.accounts.signer.key() == order_maker;
    let is_backend = ctx.accounts.signer.key() == BACKEND_AUTHORITY_PUBKEY;
    let is_expired = order_expired_at < Clock::get()?.unix_timestamp;

    require!(is_maker || (is_backend && is_expired), OrderFlowError::Unauthorized);

    let cancelled_by = if is_maker {
        CancelledBy::Maker
    } else {
        CancelledBy::Backend
    };

    // Return remaining tokens to maker
    if order_making_amount > 0 {
        let unique_id_bytes = order_unique_id.to_le_bytes();
        let signer_seeds: &[&[u8]] = &[
            b"order",
            order_maker.as_ref(),
            unique_id_bytes.as_ref(),
            &[order_bump]
        ];

        let signers = &[signer_seeds];

        let cpi_accounts = token_interface::TransferChecked {
            from: ctx.accounts.input_mint_reserve.to_account_info(),
            mint: ctx.accounts.input_mint.to_account_info(),
            to: ctx.accounts.maker_input_account.to_account_info(),
            authority: ctx.accounts.order.to_account_info(),
        };

        let cpi_program = ctx.accounts.input_token_program.to_account_info();

        let cpi_ctx = CpiContext::new_with_signer(
            cpi_program,
            cpi_accounts,
            signers
        );

        token_interface::transfer_checked(
            cpi_ctx,
            order_making_amount,
            input_mint_decimals
        )?;
    }

    // Now we can mutably borrow order
    let order = &mut ctx.accounts.order;
    order.status = OrderStatus::Cancelled;
    order.updated_at = Clock::get()?.unix_timestamp;

    emit!(OrderCancelled {
        order_key: order.key(),
        maker: order.maker,
        cancelled_by,
        cancelled_at: order.updated_at
    });

    Ok(())
}


}







#[derive(Accounts)]
pub struct CancelOrder<'info> {
    pub signer: Signer<'info>,
    ///CHECK: maker account
    #[account(mut)]
    pub maker: UncheckedAccount<'info>,
    #[account(
        mut,
        has_one = maker,
        constraint = order.status == OrderStatus::Open @ errors::OrderFlowError::OrderExpired
    )]
    pub order: Account<'info, Order>,

    #[account(
        mut,
        associated_token::mint = order.input_mint,
        associated_token::authority = order,
        associated_token::token_program = input_token_program,
    )]
    pub input_mint_reserve: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        constraint = maker_input_account.owner == maker.key(),
        constraint = maker_input_account.mint == order.input_mint

    )]
    pub maker_input_account: InterfaceAccount<'info, TokenAccount>,

    pub input_mint : InterfaceAccount<'info, Mint>,
    pub input_token_program: Interface<'info, TokenInterface>


}







#[derive(Accounts)]
pub struct FillOrder<'info> {
    //only backend can fill order
    #[account(mut)]
    pub backend: Signer<'info>,
    ///CHECK: maker account
    #[account(mut)]
    pub maker: UncheckedAccount<'info>,
    #[account(
        mut,
        has_one = maker,
        constraint = order.status == OrderStatus::Open @ errors::OrderFlowError::OrderExpired
    )]
    pub order: Account<'info, Order>,

    #[account(
        mut,
        associated_token::mint = order.input_mint,
        associated_token::authority = order,
        associated_token::token_program = input_token_program,
    )]
    pub input_mint_reserve: InterfaceAccount<'info, TokenAccount>,

    pub output_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init_if_needed,
        payer = backend,
        associated_token::mint = output_mint,
        associated_token::authority = maker,
        associated_token::token_program = output_token_program,
    )]
    pub maker_output_account: InterfaceAccount<'info, TokenAccount>,

    pub input_mint: InterfaceAccount<'info, Mint>,

    pub input_token_program: Interface<'info, TokenInterface>,
    pub output_token_program: Interface<'info, TokenInterface>,

    ///CHECK: Jupiter program account
    pub jupiter_program: UncheckedAccount<'info>,

    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,


}






#[derive(Accounts)]
#[instruction(unique_id: u64)]
pub struct InitializeOrder<'info> {
    
    pub maker: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + Order::INIT_SPACE,
        seeds = [b"order", maker.key().as_ref(), &unique_id.to_le_bytes()],
        bump,    
    )]
    pub order: Account<'info, Order>,
    pub input_mint_reserve: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub maker_input_mint_account: InterfaceAccount<'info, TokenAccount>,

    pub input_mint: InterfaceAccount<'info, Mint>,
    pub output_mint: InterfaceAccount<'info, Mint>,


    pub input_token_program: Interface<'info, TokenInterface>,
    pub output_token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
}




