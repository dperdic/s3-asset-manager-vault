use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};
use std::mem::size_of;

declare_id!("8aFjqAEYZLrHdc2F44mTWJRLV8pECgGiP8kwwQZgVEbs");

#[program]
pub mod s3_asset_manager_vault {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault: &mut Account<Vault> = &mut ctx.accounts.vault;

        vault.manager = ctx.accounts.manager.key();

        Ok(())
    }

    pub fn deposit_tokens(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::InvalidDepositAmount);

        let vault: &mut Account<Vault> = &mut ctx.accounts.vault;
        let customer_deposit: &mut Account<CustomerDeposit> = &mut ctx.accounts.customer_deposit;

        Ok(())
    }

    pub fn withdraw_tokens(_ctx: Context<Withdraw>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = manager,
        space = size_of::<Vault>() + 8,
        seeds=[],
        bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub manager: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,

    #[account(init_if_needed, payer = customer, space = size_of::<CustomerDeposit>() + 8)]
    pub customer_deposit: Account<'info, CustomerDeposit>,

    #[account(mut)]
    pub customer: Signer<'info>,

    #[account(mut)]
    pub mint_account: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint_account,
        associated_token::authority = customer,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,

    #[account(mut, has_one = customer)]
    pub customer_deposit: Account<'info, CustomerDeposit>,

    #[account(mut)]
    pub customer: Signer<'info>,

    #[account(mut)]
    pub customer_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Vault {
    pub manager: Pubkey,
    pub total_deposits: u64,
}

#[account]
pub struct CustomerDeposit {
    pub customer: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum VaultError {
    #[msg("Deposit amount must be greater than zero.")]
    InvalidDepositAmount,
    #[msg("Withdraw amount must be greater than zero.")]
    InvalidWithdrawAmount,
    #[msg("Insufficient funds to withdraw.")]
    InsufficientFunds,
    #[msg("Arithmetic overflow.")]
    Overflow,
    #[msg("Unauthorized access.")]
    Unauthorized,
    #[msg("Invalid token account.")]
    InvalidTokenAccount,
}
