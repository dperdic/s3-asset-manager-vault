use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
use std::mem::size_of;

declare_id!("8aFjqAEYZLrHdc2F44mTWJRLV8pECgGiP8kwwQZgVEbs");

const PDA_VAULT_SEED: &[u8; 5] = b"vault";
const PDA_CUSTOMER_VAULT_ACCOUNT_SEED: &[u8; 8] = b"customer";

#[program]
pub mod s_3_asset_manager_vault {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault: &mut Account<Vault> = &mut ctx.accounts.vault;

        vault.manager = ctx.accounts.manager.key();

        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::InvalidDepositAmount);

        let cpi_accounts: TransferChecked = TransferChecked {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.customer_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.customer.to_account_info(),
        };

        let cpi_program: AccountInfo = ctx.accounts.token_program.to_account_info();

        let cpi_ctx: CpiContext<TransferChecked> = CpiContext::new(cpi_program, cpi_accounts);

        match token::transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals) {
            Ok(_) => {
                let customer_vault_account: &mut Account<CustomerVaultAccount> =
                    &mut ctx.accounts.customer_vault_account;

                customer_vault_account.vault_token_account = ctx.accounts.vault_token_account.key();

                customer_vault_account.balance = ctx.accounts.vault_token_account.amount;

                Ok(())
            }
            Err(error) => Err(error),
        }
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::InvalidWithdrawAmount);

        let customer_pubkey: Pubkey = ctx.accounts.customer.key();

        let seeds: &[&[u8]; 4] = &[
            PDA_VAULT_SEED,
            PDA_CUSTOMER_VAULT_ACCOUNT_SEED.as_ref(),
            customer_pubkey.as_ref(),
            &[ctx.bumps.customer_vault_account],
        ];

        let signer_seeds: &[&[&[u8]]; 1] = &[&seeds[..]];

        let cpi_accounts: TransferChecked = TransferChecked {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.customer_token_account.to_account_info(),
            authority: ctx.accounts.customer_vault_account.to_account_info(),
        };

        let cpi_program: AccountInfo = ctx.accounts.token_program.to_account_info();

        let cpi_ctx: CpiContext<TransferChecked> =
            CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

        match token::transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals) {
            Ok(_) => {
                let customer_vault_account: &mut Account<CustomerVaultAccount> =
                    &mut ctx.accounts.customer_vault_account;

                customer_vault_account.balance = ctx.accounts.vault_token_account.amount;

                Ok(())
            }
            Err(error) => Err(error),
        }
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = manager,
        space = size_of::<Vault>() + 8,
        seeds=[PDA_VAULT_SEED.as_ref(), manager.key().as_ref()],
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

    #[account(mut)]
    pub customer: Signer<'info>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub customer_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = customer,
        space = size_of::<CustomerVaultAccount>() + 8,
        seeds = [PDA_VAULT_SEED.as_ref(), PDA_CUSTOMER_VAULT_ACCOUNT_SEED.as_ref(), customer.key().as_ref()],
        bump,
    )]
    pub customer_vault_account: Account<'info, CustomerVaultAccount>,

    #[account(
        init_if_needed,
        payer = customer,
        seeds = [PDA_VAULT_SEED.as_ref(), customer.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = customer_vault_account
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub customer: Signer<'info>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub customer_token_account: Account<'info, TokenAccount>,

    #[account(
        seeds = [PDA_VAULT_SEED.as_ref(), PDA_CUSTOMER_VAULT_ACCOUNT_SEED.as_ref(), customer.key().as_ref()],
        bump
    )]
    pub customer_vault_account: Account<'info, CustomerVaultAccount>,

    #[account(
        mut,
        seeds=[PDA_VAULT_SEED, customer.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = customer_vault_account
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Vault {
    pub manager: Pubkey,
}

#[account]
pub struct CustomerVaultAccount {
    pub vault_token_account: Pubkey,
    pub balance: u64,
}

#[error_code]
pub enum VaultError {
    #[msg("Deposit amount must be greater than zero.")]
    InvalidDepositAmount,
    #[msg("Withdraw amount must be greater than zero.")]
    InvalidWithdrawAmount,
    #[msg("Invalid mint for the associated token account.")]
    InvalidATAMint,
    #[msg("Insufficient funds to withdraw.")]
    InsufficientFunds,
    #[msg("Arithmetic overflow.")]
    Overflow,
    #[msg("Unauthorized access.")]
    Unauthorized,
    #[msg("Invalid token account.")]
    InvalidTokenAccount,
}
