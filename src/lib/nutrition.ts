/**
 * Mifflin-St Jeor equation for Basal Metabolic Rate (BMR)
 * + TDEE multiplier + macro split.
 *
 * This is the most widely used and evidence-backed formula for estimating
 * daily caloric needs (American Dietetic Association recommendation, 2005).
 */

export type Sex = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type WeightGoal = 'lose' | 'maintain' | 'gain'

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,      // little/no exercise
  light: 1.375,        // 1-3 days/week
  moderate: 1.55,      // 3-5 days/week
  active: 1.725,       // 6-7 days/week
  very_active: 1.9,    // very hard exercise / physical job
}

const GOAL_OFFSETS: Record<WeightGoal, number> = {
  lose: -500,     // ~0.5 kg/week deficit
  maintain: 0,
  gain: 350,      // lean bulk surplus
}

export interface TdeeInput {
  sex: Sex
  age: number       // years
  heightCm: number
  weightKg: number
  activityLevel: ActivityLevel
  goal: WeightGoal
}

export interface NutritionTargets {
  calories: number
  proteinG: number
  fatG: number
  carbsG: number
}

/**
 * Mifflin-St Jeor BMR:
 *   Male:   10 × weight(kg) + 6.25 × height(cm) − 5 × age + 5
 *   Female: 10 × weight(kg) + 6.25 × height(cm) − 5 × age − 161
 */
export function calculateBmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return sex === 'male' ? base + 5 : base - 161
}

export function calculateTdee(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * ACTIVITY_MULTIPLIERS[activityLevel]
}

/**
 * Full calculation: BMR → TDEE → goal adjustment → macro split.
 *
 * Macro split strategy:
 * - Protein: 2g per kg body weight (standard for active individuals)
 * - Fat: 30% of total calories
 * - Carbs: remainder
 */
export function calculateNutrition(input: TdeeInput): NutritionTargets {
  const bmr = calculateBmr(input.sex, input.weightKg, input.heightCm, input.age)
  const tdee = calculateTdee(bmr, input.activityLevel)
  const calories = Math.round(tdee + GOAL_OFFSETS[input.goal])

  const proteinG = Math.round(input.weightKg * 2)
  const fatG = Math.round((calories * 0.3) / 9)   // 9 kcal per gram of fat
  const proteinCals = proteinG * 4
  const fatCals = fatG * 9
  const carbsG = Math.round(Math.max(0, calories - proteinCals - fatCals) / 4) // 4 kcal per gram of carbs

  return { calories, proteinG, fatG, carbsG }
}

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary (little/no exercise)',
  light: 'Lightly active (1-3 days/week)',
  moderate: 'Moderately active (3-5 days/week)',
  active: 'Very active (6-7 days/week)',
  very_active: 'Extra active (athlete / physical job)',
}

export const GOAL_LABELS: Record<WeightGoal, string> = {
  lose: 'Lose weight (~0.5 kg/week)',
  maintain: 'Maintain weight',
  gain: 'Gain muscle (lean bulk)',
}
