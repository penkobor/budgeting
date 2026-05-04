import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ChevronRight, ChevronLeft, Sparkles, Calculator } from 'lucide-react'
import { Modal } from './ui/Modal'
import { pushToast } from './ui/Toast'
import { useMealPreferences, useUpsertMealPreferences } from '@/hooks/meal-preferences'
import { useSettings } from '@/hooks/queries'
import {
  calculateNutrition,
  ACTIVITY_LABELS,
  GOAL_LABELS,
  type ActivityLevel,
  type Sex,
  type WeightGoal,
} from '@/lib/nutrition'
import { exportForLlm, exportForLlmWithMealPlan } from '@/lib/export-llm'
import type { MealPreferencesInsert } from '@/lib/db.types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = 'choice' | 'eating' | 'food' | 'nutrition' | 'shopping'

const STEPS: Step[] = ['eating', 'food', 'nutrition', 'shopping']
const STEP_TITLES: Record<Step, string> = {
  choice: 'Export Mode',
  eating: 'Eating Pattern',
  food: 'Food Preferences',
  nutrition: 'Nutrition Targets',
  shopping: 'Shopping Context',
}

const DIET_OPTIONS = [
  { value: 'omnivore', label: 'Omnivore' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'keto', label: 'Keto' },
  { value: 'custom', label: 'Custom' },
]

const CUISINE_OPTIONS = [
  'Czech', 'Asian', 'Italian', 'Mediterranean', 'Mexican', 'Indian', 'American', 'French', 'Japanese', 'Korean',
]

const DEFAULT_STORES = ['Albert', 'Billa', 'Lidl']

interface FormState {
  meals_breakfast: boolean
  meals_lunch: boolean
  meals_dinner: boolean
  meals_snacks: boolean
  snacks_count: number
  eating_notes: string
  diet_type: string
  foods_love: string
  foods_avoid: string
  cuisines: string[]
  calc_mode: 'manual' | 'auto'
  sex: Sex | ''
  age: string
  height_cm: string
  weight_kg: string
  activity_level: ActivityLevel
  goal: WeightGoal
  calories: string
  protein_g: string
  fat_g: string
  carbs_g: string
  stores: string[]
  food_budget_amount: string
  food_budget_period: 'week' | 'month'
  shopping_notes: string
}

function defaultForm(): FormState {
  return {
    meals_breakfast: false,
    meals_lunch: true,
    meals_dinner: true,
    meals_snacks: true,
    snacks_count: 2,
    eating_notes: '',
    diet_type: 'omnivore',
    foods_love: '',
    foods_avoid: '',
    cuisines: [],
    calc_mode: 'manual',
    sex: '',
    age: '',
    height_cm: '',
    weight_kg: '',
    activity_level: 'moderate',
    goal: 'maintain',
    calories: '',
    protein_g: '',
    fat_g: '',
    carbs_g: '',
    stores: [...DEFAULT_STORES],
    food_budget_amount: '',
    food_budget_period: 'week',
    shopping_notes: '',
  }
}

export function ExportWizardDialog({ open, onOpenChange }: Props) {
  const { data: saved, isLoading } = useMealPreferences()
  const { data: settings } = useSettings()
  const upsert = useUpsertMealPreferences()
  const [step, setStep] = useState<Step>('choice')
  const [form, setForm] = useState<FormState>(defaultForm)
  const [exporting, setExporting] = useState(false)
  const [newStore, setNewStore] = useState('')

  // Pre-fill from saved preferences
  useEffect(() => {
    if (!saved) return
    setForm({
      meals_breakfast: saved.meals_breakfast,
      meals_lunch: saved.meals_lunch,
      meals_dinner: saved.meals_dinner,
      meals_snacks: saved.meals_snacks,
      snacks_count: saved.snacks_count,
      eating_notes: saved.eating_notes ?? '',
      diet_type: saved.diet_type,
      foods_love: saved.foods_love ?? '',
      foods_avoid: saved.foods_avoid ?? '',
      cuisines: saved.cuisines ?? [],
      calc_mode: saved.calc_mode as 'manual' | 'auto',
      sex: (saved.sex as Sex) ?? '',
      age: saved.age?.toString() ?? '',
      height_cm: saved.height_cm?.toString() ?? '',
      weight_kg: saved.weight_kg?.toString() ?? '',
      activity_level: (saved.activity_level as ActivityLevel) ?? 'moderate',
      goal: (saved.goal as WeightGoal) ?? 'maintain',
      calories: saved.calories?.toString() ?? '',
      protein_g: saved.protein_g?.toString() ?? '',
      fat_g: saved.fat_g?.toString() ?? '',
      carbs_g: saved.carbs_g?.toString() ?? '',
      stores: saved.stores?.length ? saved.stores : [...DEFAULT_STORES],
      food_budget_amount: saved.food_budget_amount?.toString() ?? '',
      food_budget_period: (saved.food_budget_period as 'week' | 'month') ?? 'week',
      shopping_notes: saved.shopping_notes ?? '',
    })
  }, [saved])

  // Reset step on close
  useEffect(() => {
    if (!open) setStep('choice')
  }, [open])

  const patch = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }, [])

  const clearField = useCallback(<K extends keyof FormState>(key: K, fallback: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: fallback }))
  }, [])

  const stepIndex = STEPS.indexOf(step as Step)
  const isFirst = stepIndex === 0
  const isLast = stepIndex === STEPS.length - 1

  const goNext = () => {
    if (isLast) {
      handleExportWithMeal()
    } else {
      setStep(STEPS[stepIndex + 1])
    }
  }
  const goBack = () => {
    if (isFirst) setStep('choice')
    else setStep(STEPS[stepIndex - 1])
  }

  const handleQuickExport = async () => {
    setExporting(true)
    try {
      await exportForLlm()
      pushToast('Export downloaded')
      onOpenChange(false)
    } catch (err) {
      pushToast((err as Error).message, 'error')
    } finally {
      setExporting(false)
    }
  }

  const handleExportWithMeal = async () => {
    setExporting(true)
    try {
      // Save preferences
      const payload: MealPreferencesInsert = {
        meals_breakfast: form.meals_breakfast,
        meals_lunch: form.meals_lunch,
        meals_dinner: form.meals_dinner,
        meals_snacks: form.meals_snacks,
        snacks_count: form.snacks_count,
        eating_notes: form.eating_notes || null,
        diet_type: form.diet_type,
        foods_love: form.foods_love || null,
        foods_avoid: form.foods_avoid || null,
        cuisines: form.cuisines,
        calc_mode: form.calc_mode,
        sex: form.sex || null,
        age: form.age ? Number(form.age) : null,
        height_cm: form.height_cm ? Number(form.height_cm) : null,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        activity_level: form.activity_level,
        goal: form.goal,
        calories: form.calories ? Number(form.calories) : null,
        protein_g: form.protein_g ? Number(form.protein_g) : null,
        fat_g: form.fat_g ? Number(form.fat_g) : null,
        carbs_g: form.carbs_g ? Number(form.carbs_g) : null,
        stores: form.stores,
        food_budget_amount: form.food_budget_amount ? Number(form.food_budget_amount) : null,
        food_budget_period: form.food_budget_period,
        shopping_notes: form.shopping_notes || null,
      }
      await upsert.mutateAsync(payload)
      await exportForLlmWithMealPlan(payload)
      pushToast('Export with meal plan downloaded')
      onOpenChange(false)
    } catch (err) {
      pushToast((err as Error).message, 'error')
    } finally {
      setExporting(false)
    }
  }

  const handleAutoCalc = () => {
    if (!form.sex || !form.age || !form.height_cm || !form.weight_kg) {
      pushToast('Fill in sex, age, height, and weight first', 'error')
      return
    }
    const result = calculateNutrition({
      sex: form.sex as Sex,
      age: Number(form.age),
      heightCm: Number(form.height_cm),
      weightKg: Number(form.weight_kg),
      activityLevel: form.activity_level,
      goal: form.goal,
    })
    setForm((f) => ({
      ...f,
      calories: result.calories.toString(),
      protein_g: result.proteinG.toString(),
      fat_g: result.fatG.toString(),
      carbs_g: result.carbsG.toString(),
    }))
    pushToast('Calculated via Mifflin-St Jeor formula')
  }

  const addStore = () => {
    const s = newStore.trim()
    if (!s || form.stores.includes(s)) return
    patch('stores', [...form.stores, s])
    setNewStore('')
  }

  const removeStore = (store: string) => {
    patch('stores', form.stores.filter((s) => s !== store))
  }

  const toggleCuisine = (c: string) => {
    patch(
      'cuisines',
      form.cuisines.includes(c)
        ? form.cuisines.filter((x) => x !== c)
        : [...form.cuisines, c],
    )
  }

  const currency = settings?.currency ?? 'CZK'

  // --- Render ---
  const title = step === 'choice' ? 'Export for AI' : `${stepIndex + 1}/${STEPS.length} · ${STEP_TITLES[step]}`

  const footer = step !== 'choice' ? (
    <div className="flex w-full gap-2">
      <button onClick={goBack} className="btn-outline flex-1 flex items-center justify-center gap-1.5">
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>
      <button
        onClick={goNext}
        disabled={exporting}
        className="btn-primary flex-1 flex items-center justify-center gap-1.5"
      >
        {isLast ? (exporting ? 'Exporting…' : 'Export') : 'Next'}
        {!isLast && <ChevronRight className="w-4 h-4" />}
      </button>
    </div>
  ) : undefined

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} footer={footer} size="lg">
      {isLoading ? (
        <div className="text-center py-8 text-fg-muted">Loading preferences…</div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.15 }}
          >
            {step === 'choice' && (
              <ChoiceStep
                onQuickExport={handleQuickExport}
                onWithMeal={() => setStep('eating')}
                exporting={exporting}
              />
            )}
            {step === 'eating' && (
              <EatingStep form={form} patch={patch} clearField={clearField} />
            )}
            {step === 'food' && (
              <FoodStep form={form} patch={patch} clearField={clearField} toggleCuisine={toggleCuisine} />
            )}
            {step === 'nutrition' && (
              <NutritionStep form={form} patch={patch} clearField={clearField} onAutoCalc={handleAutoCalc} />
            )}
            {step === 'shopping' && (
              <ShoppingStep
                form={form}
                patch={patch}
                clearField={clearField}
                currency={currency}
                newStore={newStore}
                setNewStore={setNewStore}
                addStore={addStore}
                removeStore={removeStore}
              />
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </Modal>
  )
}

// ─── Step Components ───

function ChoiceStep({ onQuickExport, onWithMeal, exporting }: {
  onQuickExport: () => void
  onWithMeal: () => void
  exporting: boolean
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        Export your financial data in a format optimised for AI analysis. Choose how much context to include.
      </p>
      <button
        onClick={onQuickExport}
        disabled={exporting}
        className="card w-full p-4 text-left hover:bg-bg-elev/50 transition-colors space-y-1"
      >
        <div className="font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          Quick Export
        </div>
        <div className="text-xs text-fg-subtle">
          Financial data only — balance, transactions, recurring rules, goals.
        </div>
      </button>
      <button
        onClick={onWithMeal}
        className="card w-full p-4 text-left hover:bg-bg-elev/50 transition-colors space-y-1 border-accent/30"
      >
        <div className="font-semibold flex items-center gap-2">
          <Calculator className="w-4 h-4 text-accent" />
          Export + Meal Plan
        </div>
        <div className="text-xs text-fg-subtle">
          Financial data + your eating habits, nutrition targets, and shopping preferences.
          The AI will generate a meal plan and shopping list within your budget.
        </div>
      </button>
    </div>
  )
}

function EatingStep({ form, patch, clearField }: {
  form: FormState
  patch: <K extends keyof FormState>(k: K, v: FormState[K]) => void
  clearField: <K extends keyof FormState>(k: K, fallback: FormState[K]) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <div className="label mb-2">Which meals do you eat?</div>
        <div className="flex flex-wrap gap-2">
          {([['meals_breakfast', 'Breakfast'], ['meals_lunch', 'Lunch'], ['meals_dinner', 'Dinner'], ['meals_snacks', 'Snacks']] as const).map(
            ([key, label]) => (
              <button
                key={key}
                onClick={() => patch(key, !form[key])}
                className={`btn text-sm ${form[key] ? 'bg-accent/10 text-accent border border-accent/30' : 'btn-outline'}`}
              >
                {label}
              </button>
            ),
          )}
        </div>
      </div>

      {form.meals_snacks && (
        <FieldWithClear label="Snacks per day" onClear={() => clearField('snacks_count', 2)}>
          <input
            type="number"
            className="input w-24"
            min={1}
            max={10}
            value={form.snacks_count}
            onChange={(e) => patch('snacks_count', Number(e.target.value) || 1)}
          />
        </FieldWithClear>
      )}

      <FieldWithClear label="Notes about eating pattern" onClear={() => clearField('eating_notes', '')}>
        <textarea
          className="input min-h-[80px] resize-y"
          placeholder="e.g. I eat a late lunch around 14:00, dinner at 20:00..."
          value={form.eating_notes}
          onChange={(e) => patch('eating_notes', e.target.value)}
        />
      </FieldWithClear>
    </div>
  )
}

function FoodStep({ form, patch, clearField, toggleCuisine }: {
  form: FormState
  patch: <K extends keyof FormState>(k: K, v: FormState[K]) => void
  clearField: <K extends keyof FormState>(k: K, fallback: FormState[K]) => void
  toggleCuisine: (c: string) => void
}) {
  return (
    <div className="space-y-5">
      <FieldWithClear label="Diet type" onClear={() => clearField('diet_type', 'omnivore')}>
        <div className="flex flex-wrap gap-2">
          {DIET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => patch('diet_type', opt.value)}
              className={`btn text-sm ${form.diet_type === opt.value ? 'bg-accent/10 text-accent border border-accent/30' : 'btn-outline'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </FieldWithClear>

      <FieldWithClear label="Foods I love" onClear={() => clearField('foods_love', '')}>
        <textarea
          className="input min-h-[60px] resize-y"
          placeholder="e.g. chicken, rice, eggs, pasta, sushi..."
          value={form.foods_love}
          onChange={(e) => patch('foods_love', e.target.value)}
        />
      </FieldWithClear>

      <FieldWithClear label="Foods to avoid / allergies" onClear={() => clearField('foods_avoid', '')}>
        <textarea
          className="input min-h-[60px] resize-y"
          placeholder="e.g. shellfish, peanuts, cilantro..."
          value={form.foods_avoid}
          onChange={(e) => patch('foods_avoid', e.target.value)}
        />
      </FieldWithClear>

      <FieldWithClear label="Preferred cuisines" onClear={() => clearField('cuisines', [])}>
        <div className="flex flex-wrap gap-2">
          {CUISINE_OPTIONS.map((c) => (
            <button
              key={c}
              onClick={() => toggleCuisine(c)}
              className={`btn text-xs ${form.cuisines.includes(c) ? 'bg-accent/10 text-accent border border-accent/30' : 'btn-outline'}`}
            >
              {c}
            </button>
          ))}
        </div>
      </FieldWithClear>
    </div>
  )
}

function NutritionStep({ form, patch, clearField, onAutoCalc }: {
  form: FormState
  patch: <K extends keyof FormState>(k: K, v: FormState[K]) => void
  clearField: <K extends keyof FormState>(k: K, fallback: FormState[K]) => void
  onAutoCalc: () => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <div className="label mb-2">How to set targets?</div>
        <div className="flex gap-2">
          <button
            onClick={() => patch('calc_mode', 'manual')}
            className={`btn text-sm flex-1 ${form.calc_mode === 'manual' ? 'bg-accent/10 text-accent border border-accent/30' : 'btn-outline'}`}
          >
            Manual
          </button>
          <button
            onClick={() => patch('calc_mode', 'auto')}
            className={`btn text-sm flex-1 ${form.calc_mode === 'auto' ? 'bg-accent/10 text-accent border border-accent/30' : 'btn-outline'}`}
          >
            Calculate (Mifflin-St Jeor)
          </button>
        </div>
      </div>

      {form.calc_mode === 'auto' && (
        <div className="space-y-4 p-3 rounded-xl bg-bg-elev/50 border border-border">
          <div className="grid grid-cols-2 gap-3">
            <FieldWithClear label="Sex" onClear={() => clearField('sex', '')}>
              <div className="flex gap-2">
                <button
                  onClick={() => patch('sex', 'male')}
                  className={`btn text-xs flex-1 ${form.sex === 'male' ? 'bg-accent/10 text-accent border border-accent/30' : 'btn-outline'}`}
                >
                  Male
                </button>
                <button
                  onClick={() => patch('sex', 'female')}
                  className={`btn text-xs flex-1 ${form.sex === 'female' ? 'bg-accent/10 text-accent border border-accent/30' : 'btn-outline'}`}
                >
                  Female
                </button>
              </div>
            </FieldWithClear>
            <FieldWithClear label="Age" onClear={() => clearField('age', '')}>
              <input
                type="number"
                className="input"
                placeholder="25"
                value={form.age}
                onChange={(e) => patch('age', e.target.value)}
              />
            </FieldWithClear>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldWithClear label="Height (cm)" onClear={() => clearField('height_cm', '')}>
              <input
                type="number"
                className="input"
                placeholder="180"
                value={form.height_cm}
                onChange={(e) => patch('height_cm', e.target.value)}
              />
            </FieldWithClear>
            <FieldWithClear label="Weight (kg)" onClear={() => clearField('weight_kg', '')}>
              <input
                type="number"
                className="input"
                placeholder="75"
                value={form.weight_kg}
                onChange={(e) => patch('weight_kg', e.target.value)}
              />
            </FieldWithClear>
          </div>

          <FieldWithClear label="Activity level" onClear={() => clearField('activity_level', 'moderate')}>
            <select
              className="input"
              value={form.activity_level}
              onChange={(e) => patch('activity_level', e.target.value as ActivityLevel)}
            >
              {(Object.entries(ACTIVITY_LABELS) as [ActivityLevel, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </FieldWithClear>

          <FieldWithClear label="Goal" onClear={() => clearField('goal', 'maintain')}>
            <select
              className="input"
              value={form.goal}
              onChange={(e) => patch('goal', e.target.value as WeightGoal)}
            >
              {(Object.entries(GOAL_LABELS) as [WeightGoal, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </FieldWithClear>

          <button onClick={onAutoCalc} className="btn-primary w-full flex items-center justify-center gap-2">
            <Calculator className="w-4 h-4" />
            Calculate TDEE &amp; Macros
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <FieldWithClear label="Calories / day" onClear={() => clearField('calories', '')}>
          <input
            type="number"
            className="input"
            placeholder="2200"
            value={form.calories}
            onChange={(e) => patch('calories', e.target.value)}
          />
        </FieldWithClear>
        <FieldWithClear label="Protein (g)" onClear={() => clearField('protein_g', '')}>
          <input
            type="number"
            className="input"
            placeholder="150"
            value={form.protein_g}
            onChange={(e) => patch('protein_g', e.target.value)}
          />
        </FieldWithClear>
        <FieldWithClear label="Fat (g)" onClear={() => clearField('fat_g', '')}>
          <input
            type="number"
            className="input"
            placeholder="70"
            value={form.fat_g}
            onChange={(e) => patch('fat_g', e.target.value)}
          />
        </FieldWithClear>
        <FieldWithClear label="Carbs (g)" onClear={() => clearField('carbs_g', '')}>
          <input
            type="number"
            className="input"
            placeholder="250"
            value={form.carbs_g}
            onChange={(e) => patch('carbs_g', e.target.value)}
          />
        </FieldWithClear>
      </div>
    </div>
  )
}

function ShoppingStep({ form, patch, clearField, currency, newStore, setNewStore, addStore, removeStore }: {
  form: FormState
  patch: <K extends keyof FormState>(k: K, v: FormState[K]) => void
  clearField: <K extends keyof FormState>(k: K, fallback: FormState[K]) => void
  currency: string
  newStore: string
  setNewStore: (v: string) => void
  addStore: () => void
  removeStore: (s: string) => void
}) {
  return (
    <div className="space-y-5">
      <FieldWithClear label="Preferred stores" onClear={() => clearField('stores', [...DEFAULT_STORES])}>
        <div className="flex flex-wrap gap-2 mb-2">
          {form.stores.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent/10 text-accent text-xs font-medium">
              {s}
              <button onClick={() => removeStore(s)} className="hover:text-negative">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Add store…"
            value={newStore}
            onChange={(e) => setNewStore(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addStore())}
          />
          <button onClick={addStore} className="btn-outline text-sm">Add</button>
        </div>
      </FieldWithClear>

      <div className="grid grid-cols-2 gap-3">
        <FieldWithClear label={`Food budget (${currency})`} onClear={() => clearField('food_budget_amount', '')}>
          <input
            type="number"
            className="input"
            placeholder="1500"
            value={form.food_budget_amount}
            onChange={(e) => patch('food_budget_amount', e.target.value)}
          />
        </FieldWithClear>
        <FieldWithClear label="Period" onClear={() => clearField('food_budget_period', 'week')}>
          <div className="flex gap-2">
            <button
              onClick={() => patch('food_budget_period', 'week')}
              className={`btn text-xs flex-1 ${form.food_budget_period === 'week' ? 'bg-accent/10 text-accent border border-accent/30' : 'btn-outline'}`}
            >
              / week
            </button>
            <button
              onClick={() => patch('food_budget_period', 'month')}
              className={`btn text-xs flex-1 ${form.food_budget_period === 'month' ? 'bg-accent/10 text-accent border border-accent/30' : 'btn-outline'}`}
            >
              / month
            </button>
          </div>
        </FieldWithClear>
      </div>

      <FieldWithClear label="Additional notes" onClear={() => clearField('shopping_notes', '')}>
        <textarea
          className="input min-h-[80px] resize-y"
          placeholder="e.g. I prefer cooking in bulk on Sundays, I have a slow cooker..."
          value={form.shopping_notes}
          onChange={(e) => patch('shopping_notes', e.target.value)}
        />
      </FieldWithClear>
    </div>
  )
}

// ─── Utility: Field with clear button ───

function FieldWithClear({ label, onClear, children }: {
  label: string
  onClear: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="label">{label}</div>
        <button
          onClick={onClear}
          className="text-[10px] text-fg-subtle hover:text-negative transition-colors"
          title="Clear"
        >
          ✕ clear
        </button>
      </div>
      {children}
    </div>
  )
}
