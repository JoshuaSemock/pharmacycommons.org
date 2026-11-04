// The package ships types for its classes but not for the UMD initialiser it exports (phase 35).
// Destination: src/rdkit.d.ts
declare module '@rdkit/rdkit' {
  const initRDKitModule: (options?: { locateFile?: (file: string) => string }) => Promise<unknown>
  export default initRDKitModule
}
