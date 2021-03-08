import { JsonRpcRequest } from 'json-rpc-engine';
import { ethErrors, EthereumRpcError } from 'eth-rpc-errors';

interface ErrorArg {
  message?: string;
  data?: JsonRpcRequest<any> | any;
}

interface MethodNotFoundArg extends ErrorArg {
  methodName?: string;
}

function unauthorized(arg?: ErrorArg): EthereumRpcError<JsonRpcRequest<any>> {
  return ethErrors.provider.unauthorized({
    message: arg?.message || 'Unauthorized to perform action. Try requesting permission first using the `requestPermissions` method. More info available at https://github.com/MetaMask/rpc-cap',
    data: arg?.data || undefined,
  });
}

function methodNotFound(opts: MethodNotFoundArg): EthereumRpcError<JsonRpcRequest<any>> {
  const message =
    opts.methodName
      ? `The method '${opts.methodName}' does not exist / is not available.`
      : undefined;

  return ethErrors.rpc.methodNotFound({ data: opts.data, message });
}

function userRejectedRequest(request?: JsonRpcRequest<any>): EthereumRpcError<JsonRpcRequest<any>> {
  return ethErrors.provider.userRejectedRequest({ data: request });
}
export { unauthorized, methodNotFound, userRejectedRequest };
