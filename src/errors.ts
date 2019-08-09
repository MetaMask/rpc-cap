import { JsonRpcRequest } from 'json-rpc-engine';

import { IRpcErrors, IJsonRpcError } from 'eth-json-rpc-errors';

const rpcErrors: IRpcErrors = require('eth-json-rpc-errors').rpcErrors;

// TODO: standardize
const USER_REJECTED_ERROR_CODE = 4002;
const USER_REJECTED_ERROR_MESSAGE = 'User rejected the request.';

function unauthorized (request?: JsonRpcRequest<any>): IJsonRpcError<JsonRpcRequest<any>> {
  return rpcErrors.eth.unauthorized(
    'Unauthorized to perform action. Try requesting permission first using the `requestPermissions` method. More info available at https://github.com/MetaMask/json-rpc-capabilities-middleware',
    request
  );
}

function invalidReq (request?: JsonRpcRequest<any>): IJsonRpcError<JsonRpcRequest<any>> {
  return rpcErrors.invalidRequest(null, request);
}

const METHOD_NOT_FOUND: IJsonRpcError<undefined> = rpcErrors.methodNotFound();
const USER_REJECTED_ERROR: IJsonRpcError<undefined> = rpcErrors.eth.nonStandard(
  USER_REJECTED_ERROR_CODE, USER_REJECTED_ERROR_MESSAGE
);

export { unauthorized, METHOD_NOT_FOUND, invalidReq, USER_REJECTED_ERROR };
