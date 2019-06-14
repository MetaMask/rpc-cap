import { JsonRpcRequest, JsonRpcResponse, JsonRpcError } from 'json-rpc-capabilities-middleware/src/@types/json-rpc-2';

type JsonRpcEngineEndCallback = (error?: JsonRpcError<any>) => void;
type JsonRpcEngineNextCallback = (returnFlightCallback?: (done: () => void) => void) => void;

interface JsonRpcMiddleware {
  (
    req: JsonRpcRequest<any>,
    res: JsonRpcResponse<any>,
    next: JsonRpcEngineNextCallback,
    end: JsonRpcEngineEndCallback,
  ) : void;
}
