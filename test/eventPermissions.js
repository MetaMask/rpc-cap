const test = require('tape');
const equal = require('fast-deep-equal');
const { CapabilitiesController } = require('../dist');
const EventEmitter = require('events');

class Emitter extends EventEmitter {}

const noop = () => undefined;

test('can register an event', async (t) => {
  let unsubscribe 
  const eventName = 'doorbellRing';

  /**
   * The event should be fired and then the test should end.
   * @param { method: string, params: Array<any> } event 
   */
  function listener (event) {
    t.ok(equal(event, { method: eventName, params: ['ding', 'dong']}), 'doorbell rang');
    unsubscribe();
    t.end();
  }

  const emitter = new Emitter();
  const ctrl = new CapabilitiesController({
    requestUserApproval: noop,
    restrictedEvents: {
      [eventName]: {
        description: 'emits an event whenever someone rings the doorbell',
        emitter,
      }
    },
  });

  const domain = { origin: 'login.metamask.io' }

  // Register a handler for a connected domain:
  unsubscribe = ctrl.eventHandler(domain, listener);

  // Request permission for that domain to listen to the restricted event
  const req = {
    method: 'requestPermissions',
    params: [
      { [eventName]: { parentCapability: 'foo' } },
    ],
  };
  await sendRpcMethodWithResponse(ctrl, domain, req);

  // Register listener for the permitted event
  const req = {
    method: 'subscribe',
    params: [
      eventName
    ],
  };
  await sendRpcMethodWithResponse(ctrl, domain, req);

  // Emit the event
  emitter.emit(eventName, 'ding', 'dong');
});

async function sendRpcMethodWithResponse(ctrl, domain, req) {
  const res = {};
  return new Promise((resolve, reject) => {
    ctrl.providerMiddlewareFunction(domain, req, res, next, end);

    function next() {
      reject(new Error('Should not call next.'));
    }

    function end(reason) {
      if (reason) {
        reject(reason);
      }
      if (res.error) {
        reject(res.error);
      }

      resolve(res);
    }
  });
}
