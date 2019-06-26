import { JsonRpcRequest, JsonRpcError } from 'json-rpc-engine';

function unauthorized (request?: JsonRpcRequest<any>): JsonRpcError<JsonRpcRequest<any>> {
  const UNAUTHORIZED_ERROR: JsonRpcError<JsonRpcRequest<any>> = {
    message: 'Unauthorized to perform action. Try requesting permission first using the `requestPermissions` method. More info available at https://github.com/MetaMask/json-rpc-capabilities-middleware',
    code: 1,
    data: request,
  };
  return UNAUTHORIZED_ERROR;
}

const METHOD_NOT_FOUND: JsonRpcError<null> = {
  code: -32601,
  message: 'Method not found',
};

function invalidReq (req?: JsonRpcRequest<any>): JsonRpcError<JsonRpcRequest<any>> {
  const INVALID_REQUEST: JsonRpcError<JsonRpcRequest<any>> = {
    code: -32602,
    message: 'Invalid request.',
    data: req,
  }
  return INVALID_REQUEST;
}

// TODO: This error code needs standardization:
const USER_REJECTED_ERROR: JsonRpcError<null> = {
  code: 5,
  message: 'User rejected the request.',
};

export { unauthorized, METHOD_NOT_FOUND, invalidReq, USER_REJECTED_ERROR };