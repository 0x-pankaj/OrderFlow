use anchor_lang::prelude::*;

declare_id!("ApiiyCyQ6AN4jE8NHNEbcdfY3MoFrZvwebukxyWWBJ6N");

#[program]
pub mod orderflow_contract {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
