const test = require('tape')
const CapabilitiesController = require('../dist').CapabilitiesController;
const equal = require('fast-deep-equal')

// TODO: Standardize!
// Maybe submit to https://github.com/ethereum/wiki/wiki/JSON-RPC-Error-Codes-Improvement-Proposal
const USER_REJECTION_CODE = 5

test('requestPermissions with user rejection creates no permissions', async (t) => {
  const expected = []

  const ctrl = new CapabilitiesController({
    requestUserApproval: () => Promise.resolve({}),
  })

  const domain = { origin: 'login.metamask.io' }
  let req = {
    method: 'requestPermissions',
    params: [
        [{restricted: {}}]
    ]
  }
  let res = {}

  ctrl.providerMiddlewareFunction(domain, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.ok(reason, 'error thrown')
    t.equal(reason.code, 5, 'Rejection error returned')
    t.ok(equal(ctrl.getPermissionsForDomain(domain.origin), expected), 'should have no permissions still')
    t.end()
  }
})

test('requestPermissions with user approval creates permission', async (t) => {

  const expected = {
     domains: {
      'login.metamask.io': {
        permissions: [{
          restricted: {}
        }]
      }
    }
  }


  const ctrl = new CapabilitiesController({
    requestUserApproval: () => Promise.resolve(expected.domains['login.metamask.io'].permissions[0]),
  })

  const domain = { origin: 'login.metamask.io' }
  let req = {
    method: 'requestPermissions',
    params: [
      {
        restricted: {}
      }
    ]
  }
  let res = {}

  ctrl.providerMiddlewareFunction(domain, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.error(reason, 'error should not be thrown')
    t.error(res.error, 'error should not be thrown')
    const endState = ctrl.state
    const perms = endState.domains[domain.origin].permissions;
    t.equal(perms[0].method, 'restricted', 'permission added.')
    t.end()
  }
})

async function sendRpcMethodWithResponse(ctrl, domain, req) {
  let res = {}
  return new Promise((resolve, reject) => {
    ctrl.providerMiddlewareFunction(domain, req, res, next, end)

    function next() {
      reject()
    }

    function end(reason) {
      if (reason) {
        reject(reason)
      }
      if (res.error) {
        reject(res.error)
      }

      resolve(res)
    }
  })
}

