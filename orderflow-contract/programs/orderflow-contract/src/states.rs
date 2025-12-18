use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Order {
    pub maker: Pubkey,
    pub input_mint: Pubkey,
    pub output_mint: Pubkey,
    pub making_amount: u64,
    pub taking_amount: u64,
    pub ori_making_amount: u64,
    pub ori_taking_amount: u64,
    pub expired_at: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub status: OrderStatus,
    pub unique_id: u64,
    pub bump: u8,
}



#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OrderStatus {
    Open,
    Filled,
    Cancelled,
}


