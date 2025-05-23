export declare class LinkedListNode<T> {
    value: T;
    prev?: LinkedListNode<T> | undefined;
    next?: LinkedListNode<T> | undefined;
    constructor(value: T, prev?: LinkedListNode<T> | undefined, next?: LinkedListNode<T> | undefined);
}
