import ts from 'typescript';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      name: 'civora-tsc-decorator-metadata',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('.ts') || id.includes('node_modules')) return null;
        const result = ts.transpileModule(code, {
          fileName: id,
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
            esModuleInterop: true,
            sourceMap: true,
          },
        });
        return {
          code: result.outputText,
          map: result.sourceMapText ? JSON.parse(result.sourceMapText) : undefined,
        };
      },
    },
  ],
  test: {
    environment: 'node',
  },
});

