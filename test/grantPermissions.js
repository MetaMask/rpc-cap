const test = require('tape')
const CapabilitiesController = require('../dist').CapabilitiesController
const equal = require('fast-deep-equal')
const uuid = require('uuid/v4')

// TODO: Standardize!
// Maybe submit to https://github.com/ethereum/wiki/wiki/JSON-RPC-Error-Codes-Improvement-Proposal
const USER_REJECTION_CODE = 5

test('grantPermissions with no permission creates no permissions', async (t) => {
  const expected = []

  const ctrl = new CapabilitiesController({
    requestUserApproval: noop,
  })

  const domain = {origin: 'login.metamask.io'}
  const otherDomain = {origin: 'other.domain.com'}
  let req = {
    method: 'grantPermissions',
    params: [
      otherDomain,
      [
        {
          method: 'restricted',
        },
      ],
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
    t.ok(equal(ctrl.getPermissionsForDomain(otherDomain.origin), expected), 'should have no permissions still')
    t.ok(equal(ctrl.getPermissionsForDomain(domain.origin), expected), 'should have no permissions still')
    t.end()
  }
})

test('grantPermissions with permission creates permission', async (t) => {

  const expected = {
     domains: {
      'login.metamask.io': {
        permissions: [
          {
            method: 'restricted',
            date: '0',
          }
        ]
      },
      'other.domain.com': {
        permissions: [
          {
            method: 'restricted',
            granter: 'login.metamask.io',
          }
        ]
      }
    }
  }

  const ctrl = new CapabilitiesController({
    requestUserApproval: noop,
  },
  {
    domains: {
      'login.metamask.io': {
        permissions: [
          {
            method: 'restricted',
            date: '0',
          }
        ],
      }
    }
  })

  const domain = {origin: 'login.metamask.io'}
  const grantee = { origin: 'other.domain.com' }
  let req = {
    method: 'grantPermissions',
    params: [
      grantee,
      [
        {
          method: 'restricted',
        },
      ],
    ]
  }
  let res = {}

  ctrl.providerMiddlewareFunction(granter, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.error(reason, 'error should not be thrown')
    t.notOk(reason, 'should throw no error')
    t.notOk(res.error, 'should assign no error')

    const granteePerms = ctrl.getPermissionsForDomain(grantee.origin)

    t.ok(granteePerms[0].method === req.params[1][0].method, 'The requested permission was created.')
    t.end()
  }
})

test('grantPermissions with permission whose granter does not exist results in auth error', async (t) => {
  const ctrl = new CapabilitiesController({
    requestUserApproval: noop,
  },
  {
    domains: {
      'login.metamask.io': {
        permissions: [
          {
            method: 'restricted',
            granter: 'other.granter2.io',
            date: '0',
          }
        ],
      }
    }
  })

  const domain = {origin: 'login.metamask.io'}
  const otherDomain = { origin: 'login.metamask.io' }
  let req = {
    method: 'grantPermissions',
    params: [
        otherDomain,
      [
        {
          method: 'restricted',
        },
      ],
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
    t.end()
  }
})

test('grantPermissions accumulates the same permission from different granters', async (t) => {

  const grantee = { origin: 'login.metamask.io' }
  const granter1 = { origin: 'xyz.co.uk' }
  const granter2 = { origin: 'abc.se' }

  const expected = [
    {
      method: 'restricted',
      date: '0',
      granter: granter1.origin,
    },
    {
      method: 'restricted',
      date: '0',
      granter: granter2.origin,
    }
  ]

  const ctrl = new CapabilitiesController({
    requestUserApproval: noop,
  },
  {
    domains: {
      [grantee.origin]: {
        permissions: [
          {
            method: 'restricted',
            date: '0',
            granter: granter1.origin,
          }
        ],
      },
      [granter2.origin]: {
        permissions: [
          {
            method: 'restricted',
            date: '0',
          }
        ],
      },
    }
  })

  let req = {
    method: 'grantPermissions',
    params: [
        grantee,
      [
        {
          method: 'restricted',
        },
      ],
    ]
  }
  let res = {}

  ctrl.providerMiddlewareFunction(granter2, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.error(reason, 'error should not be thrown')
    t.notOk(reason, 'should throw no error')
    t.notOk(res.error, 'should assign no error')

    const otherPerms = ctrl.getPermissionsForDomain(grantee.origin)

    let result
    for (let perm of otherPerms) {
        result = perm.method === 'restricted' && (
          perm.granter === granter1.origin ||
          perm.granter === granter2.origin
        )
    }
    t.ok(result, 'the requested permission was created')
    t.end()
  }
})

test('grantPermissions replaces duplicate permissions', async (t) => {

  const grantee = { origin: 'login.metamask.io' }
  const granter = { origin: 'xyz.co.uk' }

  const oldPerm = {
    method: 'restricted',
    id: uuid(),
    date: Date.now(),
    granter: granter,
  }

  const ctrl = new CapabilitiesController({
    requestUserApproval: noop,
  },
  {
    domains: {
      [grantee.origin]: {
        permissions: [
          oldPerm
        ],
      },
      [granter.origin]: {
        permissions: [
          {
            method: 'restricted',
            date: '0',
            id: uuid(),
          }
        ],
      },
    }
  })

  let req = {
    method: 'grantPermissions',
    params: [
      grantee,
      [
        {
          method: 'restricted'
        },
      ],
    ]
  }
  let res = {}

  ctrl.providerMiddlewareFunction(granter, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.error(reason, 'error should not be thrown')
    t.notOk(reason, 'should throw no error')
    t.notOk(res.error, 'should assign no error')

    const granteePerms = ctrl.getPermissionsForDomain(grantee.origin)
    t.ok(granteePerms.length === 1, 'grantee domain has a single permission')

    const newPerm = granteePerms[0]
    t.ok(
      (
        newPerm.method === oldPerm.method &&
        newPerm.granter === oldPerm.granter &&
        // newPerm.date > oldPerm.date && // becomes identical in test
        newPerm.id !== oldPerm.id
      ), 'the requested permission was created'
    )
    t.end()
  }
})
function noop () {};