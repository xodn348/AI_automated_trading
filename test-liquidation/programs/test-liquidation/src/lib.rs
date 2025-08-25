use anchor_lang::prelude::*;

declare_id!("6qBNpKqHkGG5xMdJd2zivWMKn2Ym3sqjj4xbD2N13eyH"); // We'll update this after building

#[program]
pub mod test_liquidation {
    use super::*;

    pub fn create_risky_position(ctx: Context<CreatePosition>) -> Result<()> {
        let position = &mut ctx.accounts.position;
        
        // Deposit 0.1 SOL but borrow 0.2 SOL worth of value
        position.collateral_amount = 100_000_000; // 0.1 SOL
        position.borrowed_amount = 200_000_000;   // 0.2 SOL equivalent
        position.owner = ctx.accounts.user.key();
        
        Ok(())
    }

    pub fn liquidate(ctx: Context<Liquidate>) -> Result<()> {
        let position = &mut ctx.accounts.position;
        require!(position.borrowed_amount > position.collateral_amount, LiquidationError::NotLiquidatable);
        
        // Transfer collateral to liquidator
        position.collateral_amount = 0;
        position.borrowed_amount = 0;
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreatePosition<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 8 + 8
    )]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub position: Account<'info, Position>,
    pub liquidator: Signer<'info>,
}

#[account]
pub struct Position {
    pub owner: Pubkey,
    pub collateral_amount: u64,
    pub borrowed_amount: u64,
}

#[error_code]
pub enum LiquidationError {
    #[msg("Position is not liquidatable")]
    NotLiquidatable
}
