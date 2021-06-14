const chai = require('chai');
const expect = chai.expect;

//const spies = require('chai-spies');

//chai.use(spies);

import { sysExec, SEPlaintextParser } from '../../src/index';

describe('sysExec', () => {
  it('interrupt child process if read timeout is reached', async function () {
    this.timeout(4000);
    try {
      await sysExec('/bin/sleep', ['5'], SEPlaintextParser, {
        readTimeout: 3000,
      });
    } catch (err) {
      expect(err.name).to.equal('SysExecReadTimeoutError');
    }
    return Promise.resolve(true);
  });
});
