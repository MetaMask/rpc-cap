/// <reference path="../index.ts" />

const test = require('tape');
const CapabilitiesController = require('../dist').CapabilitiesController

test('caveat defined at setup can be used', async (t) => {
  const WRITE_RESULT = 'impeccable result'
  const domain = 'login.metamask.io'

  const ctrl = new CapabilitiesController({

    restrictedMethods: {
      'write': {
        method: (req, res, next, end) => {
          res.result = WRITE_RESULT
        }
      }
    },

    caveats: {

       // This caveat always returns "foo".
       returnFoo: (serializedCaveat) => {
           return (req, res, next, end) => {
               res.result = "foo";
               end();
           }
       }
    },

    // This user always approves with the "returnFoo" caveat.
    requestUserApproval: (metadata, permissions) => {
       return {
           [domain]: {
               permissions: {
                   write: { type: 'returnFoo'}
               }
           }
       } 
    },
  },
  {
    domains: {}
  })

  let req = {
    method: 'requestPermissions',
    params: [
      {
        'write': {},
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
    t.notOk(reason, 'error should not be thrown')
    t.notOk(res.error, 'should not have error object')

    // Now let's call a restricted method:
    let req = {
      method: 'requestPermissions',
      params: [
        {
          'write': {},
        }
      ]
    }
    let res = {}
    ctrl.providerMiddlewareFunction(domain, req, res, next2, end2)

    function next2() {
      t.ok(false, 'next should not be called')
      t.end()
    }

    function end2(reason) {
      t.notOk(reason, 'error should not be thrown')
      t.notOk(res.error, 'should not have error object')
      t.equal(res.result, 'foo', 'This caveat should always return foo.')
      t.end()
    }
  }
})

/*
test('requesting restricted method with permission is called', async (t) => {
  const WRITE_RESULT = 'impeccable result'
  const domain = 'login.metamask.io'

  const ctrl = new CapabilitiesController({

    // safe methods never require approval,
    // are considered trivial / no risk.
    // maybe reading should be a permission, though!
    safeMethods: ['eth_read'],

    // optional prefix for internal methods
    methodPrefix: 'wallet_',
    restrictedMethods: {
      'eth_write': {
        method: (req, res, next, end) => {
          res.result = WRITE_RESULT
          return end()
        }
      }
    },
    requestUserApproval: noop,
  },
  {
    domains: {
      'login.metamask.io': {
        permissions: [
          {
            method: 'eth_write',
            date: '0',
          }
        ]
      }
    }
  })

  let req = { method: 'eth_write' }
  let res = {}
  ctrl.providerMiddlewareFunction(domain, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.error(reason, 'should not throw error')
    t.error(res.error, 'should not have error object')
    t.equal(res.result, WRITE_RESULT, 'Write result should be assigned.')
    t.end()
  }
})

*/