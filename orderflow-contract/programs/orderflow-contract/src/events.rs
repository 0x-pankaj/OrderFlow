use anchor_lang::prelude::*;


#[event]
pub struct OrderCreated {
    pub order_key: Pubkey,
    pub maker: Pubkey,
    pub input_mint: Pubkey,
    pub output_mint: Pubkey,
    pub making_amount: u64,
    pub taking_amount: u64,
    pub expired_at: i64,
    pub created_at: i64,
    pub unique_id: u64,
}


#[event]
pub struct OrderFilled {
    pub order_key: Pubkey,
    pub maker: Pubkey,
    pub making_amount_filled: u64,
    pub taking_amount_filled: u64,
    pub remaining_making_amount: u64,
    pub remaining_taking_amount: u64,
    pub is_filled: bool,
    pub filled_at: i64,
}


#[event]
pub struct OrderCancelled {
    pub order_key: Pubkey,
    pub maker: Pubkey,
    pub cancelled_by: CancelledBy,
    pub cancelled_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum CancelledBy {
    Maker,
    Backend
}