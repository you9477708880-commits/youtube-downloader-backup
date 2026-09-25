export function isActiveAccount(account) {
  return Boolean(account) && account.enabled !== false;
}

export function activeAccounts(accounts) {
  return accounts.filter(isActiveAccount);
}
