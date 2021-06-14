import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';
import { terser } from 'rollup-plugin-terser';

export default [
  {
    input: 'src/index.ts',
    output: [
      { file: 'build/lib.js', format: 'cjs' },
      { file: 'build/lib.min.js', format: 'cjs', plugins: [terser()] },
      { file: 'build/lib.esm.js', format: 'esm' },
    ],
    plugins: [typescript()],
  },
  {
    input: 'src/index.ts',
    output: [{ file: 'build/lib.d.ts', format: 'es' }],
    plugins: [dts()],
  },
];
