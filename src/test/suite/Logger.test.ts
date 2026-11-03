import assert from 'assert';
import TransportStream from 'winston-transport';
import { logger, set_secret_values } from '../../extension/utilities/Logger';


/** Collects the messages the logger hands to its transports */
class Capture extends TransportStream {
  public readonly messages: string[] = [];
  log(info: { message: unknown }, callback: () => void): void {
    this.messages.push(String(info.message));
    callback();
  }
}


suite('Log content', () => {

  test('secret values are masked in every log line', async () => {
    const capture = new Capture();
    logger.add(capture);
    set_secret_values(() => ['T0pS3cret']);
    try {
      logger.info('connecting with T0pS3cret as password');
      await new Promise(resolve => setTimeout(resolve, 50));   // winston writes to its transports asynchronously

      assert.ok(capture.messages.some(m => m.includes('connecting with *** as password')), capture.messages.join('\n'));
      assert.ok(!capture.messages.some(m => m.includes('T0pS3cret')));
    }
    finally {
      logger.remove(capture);
      set_secret_values(() => []);
    }
  });
});
