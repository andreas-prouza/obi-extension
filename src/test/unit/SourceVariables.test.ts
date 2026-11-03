import assert from 'assert';
import { source_specific_variables } from '../../extension/obi/compile_list/modules/source_variables';


suite('Variables stored per source', () => {

  test('computed values plus settings that differ from the general settings', () => {
    const properties = {
      SOURCE: 'lib/f/a.sqlrpgle.pgm', OBJ_NAME: 'a', TARGET_LIB: 'lib', SET_LIBL: 'liblist -a lib',
      DBGVIEW: '*SOURCE', TGTCCSID: '*JOB', ACTGRP: 'MYGRP', LIBL: ['lib', 'QGPL'],
      'global.cmds.add-lible': 'liblist -a $(LIB)', 'remote-base-dir': '/home/u/proj', INCLUDE_BNDDIR: 'BND',
    };
    const general = { DBGVIEW: '*ALL', TGTCCSID: '*JOB', ACTGRP: '*CALLER', LIBL: ['$(TARGET_LIB)', 'QGPL'] };

    assert.deepStrictEqual(source_specific_variables(properties, general, ['DBGVIEW', 'TGTCCSID', 'ACTGRP']), {
      SOURCE: 'lib/f/a.sqlrpgle.pgm', TARGET_LIB: 'lib', OBJ_NAME: 'a', SET_LIBL: 'liblist -a lib',
      DBGVIEW: '*SOURCE', ACTGRP: 'MYGRP',
    });
  });
});
