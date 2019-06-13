const test = require('tape')
const CapabilitiesController = require('../dist').CapabilitiesController;
const equal = require('fast-deep-equal')

// TODO: Standardize!  Maybe submit to https://github.com/ethereum/wiki/wiki/JSON-RPC-Error-Codes-Improvement-Proposal
const USER_REJECTION_CODE = 5

test('revokePermissions on granted permission deletes that permission', async (t) => {

  const expected = []

  const ctrl = new CapabilitiesController({
    requestUserApproval: () => Promise.resolve({}),
  },
  {
    'domains': {
      'login.metamask.io': {
        'permissions': [
          {
            method: 'restricted',
            date: '0',
          }
        ]
      },
      'other.domain.com': {
        'permissions': [
          {
            method: 'restricted',
            date: 1547176021698,
            'granter': 'login.metamask.io'
          }
        ]
      }
    },
  })

  const domain = { origin: 'login.metamask.io' }
  const otherDomain = { origin: 'other.domain.com' }
  let req = {
    method: 'revokePermissions',
    params: [
      otherDomain.origin,
      {
        restricted: {},
      },
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
    t.ok(equal(ctrl.getPermissionsForDomain(otherDomain.origin), expected), 'should have no permissions now')
    t.ok(ctrl.getPermissionsForDomain(domain.origin), 'should have permissions still')
    t.end()
  }
})


test('revokePermissions on unrelated permission returns auth error', async (t) => {

  const expected = []

  const ctrl = new CapabilitiesController({
    requestUserApproval: () => Promise.resolve(true),
  },
  {
    'domains': {
      'login.metamask.io': {
        'permissions': [
          {
            method: 'restricted',
            date: '0',
          }
        ]
      },
      'other.domain.com': {
        'permissions': [
          {
            method: 'restricted',
            date: 1547176021698,
            'granter': 'unrelated.metamask.co'
          }
        ]
      }
    },
  })

  const domain = { origin: 'login.metamask.io' }
  const otherDomain = { origin: 'other.domain.com' }
  let req = {
    method: 'revokePermissions',
    params: [
      otherDomain.origin,
      {
        restricted: {},
      },
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
    t.equal(reason.code, 1, 'Auth error returned')
    t.ok(ctrl.getPermissionsForDomain(otherDomain.origin), 'should have permissions still')
    t.ok(ctrl.getPermissionsForDomain(otherDomain.origin), 'should have permissions still')
    t.end()
  }

})

test('revokePermissions on own permission deletes that permission.', async (t) => {

  const expected = []

  const ctrl = new CapabilitiesController({
    requestUserApproval: () => Promise.resolve(true),
  },
  {
    'domains': {
        'login.metamask.io': {
        'permissions': [
          {
            method: 'restricted',
            date: '0'
          }
        ]
      },
      'other.domain.com': {
        'permissions': [
          {
            method: 'restricted',
            date: 1547176021698,
            'granter': 'unrelated.metamask.co'
          }
        ]
      }
    },
  })

  const domain = { origin: 'login.metamask.io' }
  let req = {
    method: 'revokePermissions',
    params: [
      domain.origin,
      {
        restricted: {},
      },
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
    t.ok(equal(ctrl.getPermissionsForDomain(domain.origin), expected), 'should have deleted permissions')
    t.end()
  }
})

test('revokePermissions on specific granter and method deletes only the single intended permission', async (t) => {

  const expected1 = [
    {
      method: 'restricted',
      date: '0'
    }
  ]
  const expected2 = []
  const otherExpected = [
    {
      method: 'restricted',
      date: 1547176021698,
      'granter': 'unrelated.metamask.co'
    }
  ]

  const domain = { origin: 'login.metamask.io' }
  const otherDomain = { origin: 'other.domain.com' }

  const ctrl = new CapabilitiesController({
    requestUserApproval: () => Promise.resolve(true),
  },
  {
    'domains': {
      [domain.origin]: {
        'permissions': [
          {
            method: 'restricted',
            date: '0'
          },
          {
            method: 'restricted',
            date: '0',
            granter: otherDomain.origin,
          }
        ]
      },
      [otherDomain.origin]: {
        'permissions': [
          {
            method: 'restricted',
            date: 1547176021698,
            'granter': 'unrelated.metamask.co'
          }
        ]
      }
    },
  })

  let req = {
    method: 'revokePermissions',
    params: [
      domain.origin,
      {
        restricted: {},
      },
    ]
  }

  try {
    let res = await sendRpcMethodWithResponse(ctrl, otherDomain, req);

    t.ok(equal(ctrl.getPermissionsForDomain(domain.origin), expected1), 'should have deleted target permission only')

    req = {
      method: 'revokePermissions',
      params: [
        domain.origin,
        {
          restricted: {},
        },
      ]
    }

    res = await sendRpcMethodWithResponse(ctrl, domain, req);

    t.ok(equal(ctrl.getPermissionsForDomain(domain.origin), expected2), 'should have deleted the other permission')
    t.ok(equal(ctrl.getPermissionsForDomain(otherDomain.origin), otherExpected), 'other domain unaffected')
    t.end()

  } catch (err) {
    t.end(err);
  }
})

test('revokePermissions deletes multiple permissions in single request', async (t) => {

  const expected = []

  const otherExpected = [
    {
      method: 'restricted1',
      date: 1547176021698,
      granter: 'somedomain.xyz.co'
    },
    {
      method: 'restricted2',
      date: 1547176021698,
      granter: 'somedomain.xyz.co'
    }
  ]

  const domain = { origin: 'login.metamask.io' }
  const otherDomain = { origin: 'other.domain.com' }

  const ctrl = new CapabilitiesController({
    requestUserApproval: () => Promise.resolve(true),
  },
  {
    'domains': {
      [domain.origin]: {
        'permissions': [
          {
            method: 'restricted1',
            date: '0',
            granter: otherDomain.origin,
          },
          {
            method: 'restricted2',
            date: '0',
            granter: otherDomain.origin,
          }
        ]
      },
      [otherDomain.origin]: {
        permissions: otherExpected,
      }
    },
  })

  let req = {
    method: 'revokePermissions',
    params: [
      domain.origin,
      {
        restricted1: {},
        restricted2: {},
      },
    ]
  }

  try {
    let res = await sendRpcMethodWithResponse(ctrl, otherDomain, req)
    t.ok(equal(ctrl.getPermissionsForDomain(domain.origin), expected), 'should have deleted both permissions')
    t.ok(equal(ctrl.getPermissionsForDomain(otherDomain.origin), otherExpected), 'other domain unaffected')
    t.end()
  } catch (err) {
    t.end(err);
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

