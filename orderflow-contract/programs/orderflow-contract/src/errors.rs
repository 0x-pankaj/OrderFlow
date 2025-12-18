use anchor_lang::prelude::*;



#[error_code]
pub  enum OrderFlowError {
    #[msg("The order has already expired.")]
    OrderExpired,
    #[msg("Making amount cannot be zero.")]
    MakingAmountCannotBeZero,
    #[msg("Taking amount cannot be zero.")]
    TakingAmountCannotBeZero,
    #[msg("expired_at must be a future timestamp.")]
    ExpiredAtMustBeFuture,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("No swap occurred")]
    NoSwapOccurred,
    #[msg("Slippage too high")]
    SlippageTooHigh,
    #[msg("Unauthorized")]
    Unauthorized
}