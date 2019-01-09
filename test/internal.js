const test = require('tape')
const LoginController = require('../')

// TODO: Standardize!
// Maybe submit to https://github.com/ethereum/wiki/wiki/JSON-RPC-Error-Codes-Improvement-Proposal
const USER_REJECTION_CODE = 5

test('#providerMiddlewareFunction requestPermissions method with user rejection does not add to requested permissions', {
  timeout: 500,
}, async (t) => {
  const WRITE_RESULT = 'impeccable result'

  const permissions = {}
  const ctrl = new LoginController({

    safeMethods: ['eth_read'],
    initState: { permissions },
    requestUserApproval: () => Promise.resolve(false),

  })

  ctrl.memStore.subscribe((memStore) => {
    const { permissionsRequests } = memStore
    if ('eth_write2' in permissionsRequests[0]) {
      t.ok(permissionsRequests, 'permission added to requests')
      t.end()
    }
  })

  let req = {
    method: 'wallet_requestPermissions',
    params: [{ 'eth_write2': { method: 'eth_write2' } }]
  }

  let res = { foo: 'bar' }
  let domain = 'metamask'
  ctrl.providerMiddlewareFunction(domain, req, res, next, end)

  function next() {
    t.fail('should not pass through')
    t.end()
  }

  function end(reason) {
    t.equal(reason.code, USER_REJECTION_CODE, 'Should throw user rejection error code')
    t.notOk(res.result, 'should have no result')
    t.error(reason)
  }
})
