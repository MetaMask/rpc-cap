/**
 * Child controller instances keyed by controller name
 */
export interface ChildControllerContext {
    [key: string]: BaseController<any, any>;
}
/**
 * List of child controller instances
 */
export declare type ControllerList = Array<BaseController<any, any>>;
/**
 * Controller that can be used to compose mutiple controllers together
 */
export declare class ComposableController extends BaseController<any, any> {
    private cachedState;
    private internalControllers;
    /**
     * Map of stores to compose together
     */
    context: ChildControllerContext;
    /**
     * Name of this controller used during composition
     */
    name: string;
    /**
     * Creates a ComposableController instance
     *
     * @param controllers - Map of names to controller instances
     * @param initialState - Initial state keyed by child controller name
     */
    constructor(controllers?: ControllerList, initialState?: any);
    /**
     * Get current list of child composed store instances
     *
     * @returns - List of names to controller instances
     */
    /**
    * Set new list of controller instances
    *
    * @param controllers - List of names to controller instsances
    */
    controllers: ControllerList;
    /**
     * Flat state representation, one that isn't keyed
     * of controller name. Instead, all child controller state is merged
     * together into a single, flat object.
     *
     * @returns - Merged state representation of all child controllers
     */
    readonly flatState: {};
}


/**
 * State change callbacks
 */
export declare type Listener<T> = (state: T) => void;
/**
 * @type BaseConfig
 *
 * Base controller configuration
 *
 * @property disabled - Determines if this controller is enabled
 */
export interface BaseConfig {
    disabled?: boolean;
}
/**
 * @type BaseState
 *
 * Base state representation
 *
 * @property name - Unique name for this controller
 */
export interface BaseState {
    name?: string;
}
/**
 * Controller class that provides configuration, state management, and subscriptions
 */
export declare class BaseController<C extends BaseConfig, S extends BaseState> {
    /**
     * Map of all sibling child controllers keyed by name if this
     * controller is composed using a ComposableController, allowing
     * any API on any sibling controller to be accessed
     */
    context: ChildControllerContext;
    /**
     * Default options used to configure this controller
     */
    defaultConfig: C;
    /**
     * Default state set on this controller
     */
    defaultState: S;
    /**
     * Determines if listeners are notified of state changes
     */
    disabled: boolean;
    /**
     * Name of this controller used during composition
     */
    name: string;
    /**
     * List of required sibling controllers this controller needs to function
     */
    requiredControllers: string[];
    private initialConfig;
    private initialState;
    private internalConfig;
    private internalState;
    private internalListeners;
    /**
     * Creates a BaseController instance. Both initial state and initial
     * configuration options are merged with defaults upon initialization.
     *
     * @param config - Initial options used to configure this controller
     * @param state - Initial state to set on this controller
     */
    constructor(config?: Partial<C>, state?: Partial<S>);
    /**
     * Enables the controller. This sets each config option as a member
     * variable on this instance and triggers any defined setters. This
     * also sets initial state and triggers any listeners.
     *
     * @returns - This controller instance
     */
    protected initialize(): this;
    /**
     * Retrieves current controller configuration options
     *
     * @returns - Current configuration
     */
    readonly config: C;
    /**
     * Retrieves current controller state
     *
     * @returns - Current state
     */
    readonly state: S;
    /**
     * Updates controller configuration
     *
     * @param config - New configuration options
     * @param overwrite - Overwrite config instead of merging
     * @param fullUpdate - Boolean that defines if the update is partial or not
     */
    configure(config: Partial<C>, overwrite?: boolean, fullUpdate?: boolean): void;
    /**
     * Notifies all subscribed listeners of current state
     */
    notify(): void;
    /**
     * Extension point called if and when this controller is composed
     * with other controllers using a ComposableController
     */
    onComposed(): void;
    /**
     * Adds new listener to be notified of state changes
     *
     * @param listener - Callback triggered when state changes
     */
    subscribe(listener: Listener<S>): void;
    /**
     * Removes existing listener from receiving state changes
     *
     * @param listener - Callback to remove
     * @returns - True if a listener is found and unsubscribed
     */
    unsubscribe(listener: Listener<S>): boolean;
    /**
     * Updates controller state
     *
     * @param state - New state
     * @param overwrite - Overwrite state instead of merging
     */
    update(state: Partial<S>, overwrite?: boolean): void;
}

export default BaseController;
