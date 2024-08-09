use anchor_lang::prelude::*;

declare_id!("8aFjqAEYZLrHdc2F44mTWJRLV8pECgGiP8kwwQZgVEbs");

#[program]
pub mod s3_asset_manager_vault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
