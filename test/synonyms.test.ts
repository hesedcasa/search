import {expect} from 'chai'

import {parseSynonymGroups} from '../src/synonyms.js'

describe('synonyms', () => {
  describe('parseSynonymGroups', () => {
    it('rejects non-string terms in synonym groups', () => {
      expect(() => parseSynonymGroups('[["bug", null]]')).to.throw(
        TypeError,
        'Synonyms file must be a JSON array of string arrays',
      )
    })
  })
})
