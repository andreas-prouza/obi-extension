import assert from 'assert';
import { replaceCmdParameters, removeUnresolvedCmdParameters, find_unresolved_placeholders } from '../../extension/obi/compile_list/modules/cmd_parameters';


/** The removal as implemented before (reference for the characterization test). */
function legacy_remove(cmd: string): string {
  for (const re of [/ACTGRP\(\$\(ACTGRP\)\)/g, /ACTGRP\(\)/g, /BNDDIR\(\$\(INCLUDE_BNDDIR\)\)/g, /BNDDIR\(\)/g,
                    /TGTRLS\(\$\(TGTRLS\)\)/g, /TGTRLS\(\)/g, /STGMDL\(\$\(STGMDL\)\)/g, /STGMDL\(\)/g,
                    /TGTCCSID\(\$\(TGTCCSID\)\)/g, /TGTCCSID\(\)/g, /DBGVIEW\(\$\(DBGVIEW\)\)/g, /DBGVIEW\(\)/g,
                    /INCDIR\(\$\(INCDIR_SQLRPGLE\)\)/g, /INCDIR\(\)/g, /INCDIR\(\$\(INCDIR_RPGLE\)\)/g])
    cmd = cmd.replace(re, '');
  return cmd;
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();


suite('Command parameters', () => {

  test('simple and nested substitution', () => {
    assert.strictEqual(replaceCmdParameters('CRTPGM PGM($(TARGET_LIB)/$(OBJ_NAME))', { TARGET_LIB: 'lib', OBJ_NAME: 'pgm' }), 'CRTPGM PGM(lib/pgm)');
    assert.strictEqual(replaceCmdParameters('$(A)', { A: '$(B)', B: 'x' }), 'x');
    assert.strictEqual(replaceCmdParameters('X($(N))', { N: 5 }), 'X(5)');
  });


  test('keys with dots and dashes are matched exactly', () => {
    assert.strictEqual(replaceCmdParameters('$(global.cmds.add-lible)', { 'global.cmds.add-lible': 'ADDLIBLE' }), 'ADDLIBLE');
    assert.strictEqual(replaceCmdParameters('$(globalxcmds.add-lible)', { 'global.cmds.add-lible': 'ADDLIBLE' }), '$(globalxcmds.add-lible)');
  });


  test('unknown placeholders and shell command substitution stay', () => {
    assert.strictEqual(replaceCmdParameters('cd $(pwd) && echo $(echo hi)', { X: '1' }), 'cd $(pwd) && echo $(echo hi)');
  });


  test('"$$" and "$&" in values are taken literally', () => {
    assert.strictEqual(replaceCmdParameters('echo $(V)', { V: 'pid $$ and $&' }), 'echo pid $$ and $&');
  });


  test('self reference and cycles throw with the variable names', () => {
    assert.throws(() => replaceCmdParameters('$(A)', { A: 'x $(A)' }), /A/);
    assert.throws(() => replaceCmdParameters('$(A)', { A: '$(B)', B: '$(A)' }), (e: Error) => /A/.test(e.message) && /B/.test(e.message));
  });


  test('optional keywords: same result as before, apart from whitespace', () => {
    const cmds = [
      'CRTBNDRPG PGM(L/X) SRCSTMF(x) ACTGRP($(ACTGRP)) DBGVIEW(*ALL)',
      'CRTSRVPGM BNDDIR($(INCLUDE_BNDDIR)) TGTRLS($(TGTRLS)) STGMDL($(STGMDL))',
      'CRTSQLRPGI INCDIR($(INCDIR_SQLRPGLE)) TGTCCSID($(TGTCCSID)) DBGVIEW($(DBGVIEW))',
      'CRTRPGMOD INCDIR($(INCDIR_RPGLE)) ACTGRP() BNDDIR() TGTRLS() STGMDL() TGTCCSID() DBGVIEW() INCDIR()',
      'CRTPGM PGM(L/X) ACTGRP(*CALLER) TGTRLS(*CURRENT)',
    ];
    for (const cmd of cmds)
      assert.strictEqual(squash(removeUnresolvedCmdParameters(cmd)), squash(legacy_remove(cmd)), cmd);
  });


  test('optional keywords: case-insensitive, whitespace removed with the keyword, mandatory ones stay', () => {
    assert.strictEqual(removeUnresolvedCmdParameters('X actgrp($(ACTGRP)) Y'), 'X Y');
    assert.strictEqual(removeUnresolvedCmdParameters('CRTBNDRPG PGM(X) DBGVIEW() TGTRLS(*CURRENT)'), 'CRTBNDRPG PGM(X) TGTRLS(*CURRENT)');
    assert.strictEqual(removeUnresolvedCmdParameters('CRTBNDRPG PGM($(OBJ_NAME))'), 'CRTBNDRPG PGM($(OBJ_NAME))');
  });


  test('find_unresolved_placeholders reports OBI variables only', () => {
    assert.deepStrictEqual(find_unresolved_placeholders('cd $(pwd) && X($(TARGET_LIBB)) $(echo x)'), ['TARGET_LIBB']);
  });
});
