/**
 * FinePointRehab Achievement System
 * 
 * Complete achievement tracking and unlocking system with proper ES module exports
 */

import { storage } from './utils.js';
import { EXERCISES } from './exercises.js';

// ============================================================================
// SAFE STORAGE HELPERS
// ============================================================================

function getJSON(key, fallback) {
  const raw = storage.get(key);
  if (raw == null) return fallback;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { return fallback; }
}

function getBool(key, fallback=false) {
  const v = storage.get(key);
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return fallback;
}

function setBool(key, val) {
  // store as string to be explicit
  storage.set(key, val ? 'true' : 'false');
}

// ============================================================================
// ACHIEVEMENT STORAGE HELPERS
// ============================================================================

function getUnlockedSet() {
  const arr = getJSON('achievements', []);
  return new Set(Array.isArray(arr) ? arr : []);
}

function saveUnlocked(set) {
  storage.set('achievements', JSON.stringify([...set]));
}

// ============================================================================
// ACHIEVEMENT DEFINITIONS
// ============================================================================

export const ACHIEVEMENTS = {
  firstSteps:   { id:'firstSteps',   name:'First Steps',   description:'Complete your first session' },
  consistent:   { id:'consistent',   name:'Consistent',    description:'Achieve a 7-day streak' },
  dedicated:    { id:'dedicated',    name:'Dedicated',     description:'Complete 50 total sessions' },
  personalBest: { id:'personalBest', name:'Personal Best', description:'Beat your previous score' },
  explorer:     { id:'explorer',     name:'Explorer',      description:'Try all available exercises' }
};

// ============================================================================
// MAIN ACHIEVEMENT CHECKING FUNCTION
// ============================================================================

export function checkAndUnlockAchievements() {
  const unlocked = getUnlockedSet();
  const newly = [];

  // DEBUG: Log what we're working with
  console.log('=== ACHIEVEMENT DEBUG ===');
  console.log('EXERCISES:', EXERCISES);
  console.log('localStorage keys:', Object.keys(localStorage));
  
  // Calculate total sessions by summing all exercise sessions
  let totalSessions = 0;
  
  // Handle both array and object formats for EXERCISES
  const exerciseList = Array.isArray(EXERCISES) ? EXERCISES : Object.values(EXERCISES);
  console.log('Exercise list:', exerciseList);

  // 🔧 FIX: actually iterate and sum sessions (+ per-exercise debug)
  for (const exercise of exerciseList) {
    const sessions = storage.getInt(`exercise:${exercise.id}:sessions`, 0);
    console.log(`sessions for ${exercise.id}:`, sessions);
    totalSessions += sessions;
  }
  
  console.log('Total sessions calculated:', totalSessions);
  console.log('Unlocked set:', [...unlocked]);
  
  const streak = storage.getInt('streak', 0);
  console.log('Streak:', streak);

  // First Steps: any session completed
  if (totalSessions >= 1 && !unlocked.has('firstSteps')) {
    console.log('Unlocking firstSteps!');
    unlocked.add('firstSteps'); 
    newly.push('firstSteps');
  } else {
    console.log('firstSteps conditions: totalSessions>=1?', totalSessions >= 1, 'not already unlocked?', !unlocked.has('firstSteps'));
  }
  
  // Consistent: 7-day streak
  if (streak >= 7 && !unlocked.has('consistent')) {
    console.log('Unlocking consistent!');
    unlocked.add('consistent'); 
    newly.push('consistent');
  }
  
  // Dedicated: 50 total sessions
  if (totalSessions >= 50 && !unlocked.has('dedicated')) {
    console.log('Unlocking dedicated!');
    unlocked.add('dedicated'); 
    newly.push('dedicated');
  } else {
    console.log('dedicated conditions: totalSessions>=50?', totalSessions >= 50, 'not already unlocked?', !unlocked.has('dedicated'));
  }

  // Personal best flag (boolean-safe)
  const personalBestFlag = getBool('newPersonalBest', false);
  console.log('Personal best flag:', personalBestFlag);
  if (personalBestFlag && !unlocked.has('personalBest')) {
    console.log('Unlocking personalBest!');
    unlocked.add('personalBest'); 
    newly.push('personalBest');
    setBool('newPersonalBest', false); // Clear the flag after unlocking
  }

  // Explorer: all exercises tried (unique count)
  const triedList = getJSON('tried', []);
  console.log('Tried list:', triedList);
  const triedCount = Array.isArray(triedList) ? new Set(triedList).size : 0;
  const totalExercises = exerciseList.length;
  console.log(`Explorer check: tried ${triedCount} out of ${totalExercises} exercises`);
  
  if (triedCount >= totalExercises && !unlocked.has('explorer')) {
    console.log('Unlocking explorer!');
    unlocked.add('explorer'); 
    newly.push('explorer');
  } else {
    console.log('explorer conditions: triedCount>=totalExercises?', triedCount >= totalExercises, 'not already unlocked?', !unlocked.has('explorer'));
  }

  console.log('Newly unlocked:', newly);
  console.log('=== END ACHIEVEMENT DEBUG ===');

  // Save unlocked achievements if any new ones
  if (newly.length) {
    saveUnlocked(unlocked);
    
    // Store unlock timestamps
    newly.forEach(achievementId => {
      storage.set(`achievement_${achievementId}_date`, new Date().toISOString());
    });
    
    // Show toast notifications if available
    if (typeof toast !== 'undefined' && toast?.show) {
      if (newly.length === 1) {
        const achievement = ACHIEVEMENTS[newly[0]];
        toast.show(`🎉 Achievement Unlocked: ${achievement.name}!`, {
          type: 'achievement',
          duration: 4000
        });
      } else {
        toast.show(`🎉 ${newly.length} achievements unlocked!`, {
          type: 'achievement',
          duration: 4000
        });
      }
    }
  }

  return newly;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function getAchievements() { 
  return [...getUnlockedSet()]; 
}

export function getUnlockedAchievements() { 
  return getAchievements(); 
}

export function isAchievementUnlocked(id) { 
  return getUnlockedSet().has(id); 
}

export function getAchievementProgress() {
  // Calculate total sessions by summing all exercise sessions
  let totalSessions = 0;
  const exerciseList = Array.isArray(EXERCISES) ? EXERCISES : Object.values(EXERCISES);
  
  for (const exercise of exerciseList) {
    const sessions = storage.getInt(`exercise:${exercise.id}:sessions`, 0);
    totalSessions += sessions;
  }
  
  const streak = storage.getInt('streak', 0);
  const triedList = getJSON('tried', []);
  const triedCount = Array.isArray(triedList) ? new Set(triedList).size : 0;
  const totalExercises = exerciseList.length;

  return {
    firstSteps: { 
      unlocked: isAchievementUnlocked('firstSteps'),
      progress: Math.min(totalSessions, 1),
      target: 1,
      description: 'Complete your first session'
    },
    consistent: { 
      unlocked: isAchievementUnlocked('consistent'),
      progress: streak,
      target: 7,
      description: 'Achieve a 7-day streak'
    },
    dedicated: { 
      unlocked: isAchievementUnlocked('dedicated'),
      progress: totalSessions,
      target: 50,
      description: 'Complete 50 total sessions'
    },
    personalBest: { 
      unlocked: isAchievementUnlocked('personalBest'),
      progress: getBool('newPersonalBest', false) ? 1 : 0,
      target: 1,
      description: 'Beat your previous score'
    },
    explorer: { 
      unlocked: isAchievementUnlocked('explorer'),
      progress: triedCount,
      target: totalExercises,
      description: 'Try all available exercises'
    }
  };
}

// ============================================================================
// MARK EXERCISE AS TRIED (for Explorer achievement)
// ============================================================================

export function markExerciseTried(exerciseId) {
  const tried = getJSON('tried', []);
  if (!tried.includes(exerciseId)) {
    tried.push(exerciseId);
    storage.set('tried', JSON.stringify(tried));
  }
}

// ============================================================================
// EXPORTS FOR COMPATIBILITY
// ============================================================================

export const achievements = {
  checkAchievements: checkAndUnlockAchievements,
  checkAndUnlockAchievements,
  getUnlockedAchievements,
  isAchievementUnlocked,
  getAchievementProgress,
  markExerciseTried,
  ACHIEVEMENTS
};