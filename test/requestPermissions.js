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
        ['restricted']
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
        permissions: [
          {
            method: 'restricted',
            date: '0',
          }
        ]
      }
    }
  }


  const ctrl = new CapabilitiesController({
    requestUserApproval: () => Promise.resolve(expected.domains['login.metamask.io']),
  })

  const domain = { origin: 'login.metamask.io' }
  let req = {
    method: 'requestPermissions',
    params: [
      [
        {
          method: 'restricted'
        }
      ]
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
    t.ok(equal(endState.domains[domain.origin].permissions, req.params[0]), 'should have the requested permissions')
    t.end()
  }
})

test('requestPermissions with returned stub object defines future responses', async (t) => {
  const expected = ['Account 1']

  const ctrl = new CapabilitiesController({

    restrictedMethods: {
      'viewAccounts': {
        description: 'Allows viewing the public address of an Ethereum account.',
        method: (req, res, next, end) => {
          res.result = expected.concat(['Account 2 secret account'])
          end()
        },
      },
    },

    requestUserApproval: async (domain, req) => {
      return {
        'viewAccounts': [{
          type: 'static',
          value: expected,
        }],
      }
    },
  })

  const domain = { origin: 'login.metamask.io' }
  let req = {
    method: 'requestPermissions',
    params: [
      [
        {
          method: 'viewAccounts'
        }
      ]
    ]
  }

  try {
    let res = await sendRpcMethodWithResponse(ctrl, domain, req)

    let accountsReq = {
      method: req.params[0][0]['method'], // 'viewAccounts'
    }

    let result = await sendRpcMethodWithResponse(ctrl, domain, accountsReq)
    let accounts = result.result

    t.equal(accounts.length, 1, 'returns one account')
    t.ok(equal(accounts, expected, 'returns expected account'))
    t.equal(ctrl.getPermissionsRequests().length, 0, 'no permissions requests remain')

    t.end()

  } catch (reason) {
    t.error(reason)
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

