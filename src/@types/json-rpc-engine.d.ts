import { JsonRpcRequest, JsonRpcResponse, JsonRpcError } from 'json-rpc-capabilities-middleware/src/interfaces/json-rpc-2';

type JsonRpcEngineEndCallback = (error?: JsonRpcError<any>) => void;
type JsonRpcEngineNextCallback = (returnFlightCallback?: (res: JsonRpcResponse<any>) => void) => void;

interface JsonRpcMiddleware {
  (
    req: JsonRpcRequest<any>,
    res: JsonRpcResponse<any>,
    next: JsonRpcEngineNextCallback,
    end: JsonRpcEngineEndCallback,
  ) : void;
}
