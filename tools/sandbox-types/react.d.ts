/**
 * Tipos mínimos de React/ReactDOM usados SOMENTE quando `@types/react` não está instalado
 * (ex.: ambiente sem acesso ao npm). Numa instalação normal (`npm install`) este arquivo
 * não é usado — veja scripts/typecheck.mjs. Props de elementos DOM ficam frouxas (any);
 * hooks e componentes próprios continuam tipados.
 */
declare module 'react' {
  export type ReactNode = any;
  export type ReactElement = any;
  export type Key = string | number;
  export type CSSProperties = { [key: string]: string | number | undefined };
  export type Dispatch<A> = (value: A) => void;
  export type SetStateAction<S> = S | ((prev: S) => S);
  export interface RefObject<T> { current: T }
  export interface MutableRefObject<T> { current: T }
  export type Ref<T> = ((instance: T | null) => void) | RefObject<T | null> | null;
  export type ComponentType<P = {}> = ((props: P) => any) | (new (props: P) => Component<P, any>);
  export type FC<P = {}> = (props: P) => any;
  export type PropsWithChildren<P = {}> = P & { children?: ReactNode };
  type Ev<T> = { target: EventTarget & T; currentTarget: T; [k: string]: any };
  export type ChangeEvent<T = Element> = Ev<T> & { target: T };
  export type MouseEvent<T = Element> = Ev<T> & MouseEventInit & { clientX: number; clientY: number; button: number; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; preventDefault(): void; stopPropagation(): void; detail: number };
  export type PointerEvent<T = Element> = MouseEvent<T> & { pointerId: number };
  export type KeyboardEvent<T = Element> = Ev<T> & { key: string; code: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; preventDefault(): void; stopPropagation(): void; nativeEvent: any };
  export type DragEvent<T = Element> = MouseEvent<T> & { dataTransfer: DataTransfer };
  export type ClipboardEvent<T = Element> = Ev<T> & { clipboardData: DataTransfer; preventDefault(): void };
  export type FormEvent<T = Element> = Ev<T> & { preventDefault(): void };
  export type SyntheticEvent<T = Element> = Ev<T> & { preventDefault(): void; stopPropagation(): void };
  export type FocusEvent<T = Element> = Ev<T>;
  export type UIEvent<T = Element> = Ev<T>;
  export type WheelEvent<T = Element> = MouseEvent<T> & { deltaX: number; deltaY: number };
  export type HTMLAttributes<T> = { [k: string]: any };
  export type ButtonHTMLAttributes<T> = { [k: string]: any };
  export type InputHTMLAttributes<T> = { [k: string]: any };
  export type TextareaHTMLAttributes<T> = { [k: string]: any };
  export type SelectHTMLAttributes<T> = { [k: string]: any };
  export type SVGAttributes<T> = { [k: string]: any };

  export function useState<S>(init: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useRef<T>(init: T): MutableRefObject<T>;
  export function useRef<T>(init: T | null): RefObject<T | null>;
  export function useRef<T = undefined>(): MutableRefObject<T | undefined>;
  export function useEffect(cb: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(cb: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(fn: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...a: any[]) => any>(fn: T, deps: readonly unknown[]): T;
  export function useId(): string;
  export function useReducer<S, A>(r: (s: S, a: A) => S, init: S): [S, Dispatch<A>];
  export function useSyncExternalStore<T>(subscribe: (cb: () => void) => () => void, getSnapshot: () => T, getServerSnapshot?: () => T): T;
  export function useDeferredValue<T>(v: T): T;
  export function useTransition(): [boolean, (cb: () => void) => void];
  export function useImperativeHandle<T>(ref: Ref<T> | undefined, init: () => T, deps?: readonly unknown[]): void;
  export function startTransition(cb: () => void): void;
  export function memo<C extends (props: any) => any>(c: C, eq?: (a: any, b: any) => boolean): C;
  export function forwardRef<T, P = {}>(render: (props: P, ref: Ref<T>) => any): (props: P & { ref?: Ref<T> }) => any;
  export function createContext<T>(def: T): { Provider: (props: { value: T; children?: ReactNode }) => any; Consumer: any };
  export function useContext<T>(ctx: { Provider: any }): T;
  export function isValidElement(v: unknown): boolean;
  export function cloneElement(el: any, props?: any, ...children: any[]): any;
  export const Fragment: any;
  export const StrictMode: any;
  export const Children: any;
  export class Component<P = {}, S = {}> {
    constructor(props: P);
    props: Readonly<P> & { children?: ReactNode };
    state: Readonly<S>;
    setState(s: Partial<S> | ((s: S) => Partial<S>)): void;
    render(): ReactNode;
  }
  export as namespace React;
}

declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module 'react-dom/client' {
  export function createRoot(el: Element | DocumentFragment): { render(node: any): void; unmount(): void };
}

declare module 'react-dom' {
  export function createPortal(children: any, container: Element | DocumentFragment): any;
  export function flushSync(cb: () => void): void;
}

declare namespace JSX {
  type Element = any;
  /** Props de elementos DOM: tudo frouxo, mas handlers de evento têm tipo contextual (evita `e` implícito). */
  interface DomProps {
    [k: string]: any;
    onChange?: (e: import('react').ChangeEvent<any>) => void;
    onInput?: (e: import('react').FormEvent<any>) => void;
    onSubmit?: (e: import('react').FormEvent<any>) => void;
    onClick?: (e: import('react').MouseEvent<any>) => void;
    onDoubleClick?: (e: import('react').MouseEvent<any>) => void;
    onContextMenu?: (e: import('react').MouseEvent<any>) => void;
    onMouseDown?: (e: import('react').MouseEvent<any>) => void;
    onMouseUp?: (e: import('react').MouseEvent<any>) => void;
    onMouseEnter?: (e: import('react').MouseEvent<any>) => void;
    onMouseLeave?: (e: import('react').MouseEvent<any>) => void;
    onPointerDown?: (e: import('react').PointerEvent<any>) => void;
    onPointerMove?: (e: import('react').PointerEvent<any>) => void;
    onPointerUp?: (e: import('react').PointerEvent<any>) => void;
    onPointerCancel?: (e: import('react').PointerEvent<any>) => void;
    onPointerEnter?: (e: import('react').PointerEvent<any>) => void;
    onPointerLeave?: (e: import('react').PointerEvent<any>) => void;
    onKeyDown?: (e: import('react').KeyboardEvent<any>) => void;
    onKeyUp?: (e: import('react').KeyboardEvent<any>) => void;
    onFocus?: (e: import('react').FocusEvent<any>) => void;
    onBlur?: (e: import('react').FocusEvent<any>) => void;
    onPaste?: (e: import('react').ClipboardEvent<any>) => void;
    onDrag?: (e: import('react').DragEvent<any>) => void;
    onDragStart?: (e: import('react').DragEvent<any>) => void;
    onDragEnd?: (e: import('react').DragEvent<any>) => void;
    onDragOver?: (e: import('react').DragEvent<any>) => void;
    onDragEnter?: (e: import('react').DragEvent<any>) => void;
    onDragLeave?: (e: import('react').DragEvent<any>) => void;
    onDrop?: (e: import('react').DragEvent<any>) => void;
    onWheel?: (e: import('react').WheelEvent<any>) => void;
    onScroll?: (e: import('react').UIEvent<any>) => void;
    onLoad?: (e: import('react').SyntheticEvent<any>) => void;
    onError?: (e: import('react').SyntheticEvent<any>) => void;
    onLoadedData?: (e: import('react').SyntheticEvent<any>) => void;
    onClose?: (e: import('react').SyntheticEvent<any>) => void;
  }
  interface IntrinsicElements { [name: string]: DomProps }
  interface ElementChildrenAttribute { children: {} }
  interface IntrinsicAttributes { key?: string | number | null }
}
