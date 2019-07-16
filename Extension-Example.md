# ethereum api extension example

Hypothetical API

```javascript
// You can name your permissions whatever you want, they'll be returned on
// one promise-returning object.

const neededPermissions = {
  accounts: { method: 'eth_requestAccounts', caveats: [ { limit: 1 } ] },
  sendTransaction: { method: 'eth_sendTransaction' },
  read: { method: 'eth_call' },
  getBalance: { method: 'eth_getBalance' }
}

async function main () {

  const ethereum = window.ethereum
  const user = await ethereum.requestPermissions(neededPermissions)
  await user.sendTransaction({ to: me, value: aModestSum })

}
```

