declare module "@xenova/transformers" {
  export const pipeline: (task: string, model: string) => Promise<
    (input: string, options?: { pooling: "mean"; normalize: true }) => Promise<{ data: Float32Array }>
  >
}
