export const genRandomStr = () => Math.random().
    toString(36).
    replace(/[^a-z]+/g, '').
    substring(0, 5)
