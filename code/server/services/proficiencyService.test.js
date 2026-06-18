import { describe, it, expect } from 'vitest';
import proficiencyService from './proficiencyService.js';

describe('proficiencyService', () => {
  describe('getDefaultLevels', () => {
    it('returns 5 levels', () => {
      const levels = proficiencyService.getDefaultLevels();
      expect(levels).toHaveLength(5);
    });

    it('returns levels with correct ids', () => {
      const levels = proficiencyService.getDefaultLevels();
      const ids = levels.map((l) => l.id);
      expect(ids).toEqual(['beginner', 'elementary', 'intermediate', 'upper-intermediate', 'advanced']);
    });

    it('returns a deep copy (mutation safe)', () => {
      const levels1 = proficiencyService.getDefaultLevels();
      const levels2 = proficiencyService.getDefaultLevels();
      levels1[0].label = 'MODIFIED';
      expect(levels2[0].label).not.toBe('MODIFIED');
    });

    it('each level has prompts for all 4 skill types', () => {
      const levels = proficiencyService.getDefaultLevels();
      for (const level of levels) {
        expect(level.prompts).toBeDefined();
        expect(level.prompts.read).toBeTruthy();
        expect(level.prompts.write).toBeTruthy();
        expect(level.prompts.listen).toBeTruthy();
        expect(level.prompts.speak).toBeTruthy();
      }
    });
  });

  describe('isBuiltinLevel', () => {
    it('returns true for builtin levels', () => {
      expect(proficiencyService.isBuiltinLevel('beginner')).toBe(true);
      expect(proficiencyService.isBuiltinLevel('elementary')).toBe(true);
      expect(proficiencyService.isBuiltinLevel('intermediate')).toBe(true);
      expect(proficiencyService.isBuiltinLevel('upper-intermediate')).toBe(true);
      expect(proficiencyService.isBuiltinLevel('advanced')).toBe(true);
    });

    it('returns false for non-builtin level', () => {
      expect(proficiencyService.isBuiltinLevel('custom-level')).toBe(false);
      expect(proficiencyService.isBuiltinLevel('')).toBe(false);
    });
  });

  describe('getProficiencyPrompt', () => {
    it('returns empty string for null config', () => {
      expect(proficiencyService.getProficiencyPrompt(null, 'read')).toBe('');
    });

    it('returns empty string for undefined config', () => {
      expect(proficiencyService.getProficiencyPrompt(undefined, 'read')).toBe('');
    });

    it('returns empty string when config has no levels', () => {
      expect(proficiencyService.getProficiencyPrompt({}, 'read')).toBe('');
    });

    it('returns empty string when config has no selected', () => {
      expect(proficiencyService.getProficiencyPrompt({ levels: [] }, 'read')).toBe('');
    });

    it('returns empty string when selected level not in levels', () => {
      const config = {
        levels: [{ id: 'intermediate', prompts: { read: 'intermediate prompt' } }],
        selected: { read: 'nonexistent' },
      };
      expect(proficiencyService.getProficiencyPrompt(config, 'read')).toBe('');
    });

    it('returns correct prompt for matched level and skill', () => {
      const config = {
        levels: [{ id: 'intermediate', prompts: { read: 'intermediate read prompt' } }],
        selected: { read: 'intermediate' },
      };
      expect(proficiencyService.getProficiencyPrompt(config, 'read')).toBe('intermediate read prompt');
    });

    it('returns empty string for unselected skill type', () => {
      const config = {
        levels: [{ id: 'intermediate', prompts: { read: 'read prompt' } }],
        selected: { write: 'intermediate' }, // read not selected
      };
      expect(proficiencyService.getProficiencyPrompt(config, 'read')).toBe('');
    });
  });

  describe('buildScenarioProficiency', () => {
    it('returns empty string for null config', () => {
      expect(proficiencyService.buildScenarioProficiency(null, 'read')).toBe('');
    });

    it('returns formatted prompt with proficiency level info', () => {
      const config = {
        levels: [{ id: 'beginner', prompts: { read: 'beginner read prompt' } }],
        selected: { read: 'beginner' },
      };
      const result = proficiencyService.buildScenarioProficiency(config, 'read');
      expect(result).toContain('STUDENT PROFICIENCY LEVEL');
      expect(result).toContain('beginner read prompt');
    });
  });

  describe('buildJudgeProficiency', () => {
    it('returns empty string for null config', () => {
      expect(proficiencyService.buildJudgeProficiency(null, 'read')).toBe('');
    });

    it('returns formatted prompt with judging guidance', () => {
      const config = {
        levels: [{ id: 'advanced', prompts: { write: 'advanced write prompt' } }],
        selected: { write: 'advanced' },
      };
      const result = proficiencyService.buildJudgeProficiency(config, 'write');
      expect(result).toContain('STUDENT PROFICIENCY LEVEL');
      expect(result).toContain('advanced write prompt');
      expect(result).toContain('Judge');
    });
  });
});
