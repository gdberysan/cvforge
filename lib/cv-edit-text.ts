/**
 * How the CV editor shows a skills list and reads it back: one skill per
 * line, because a skill may hold a comma ("Google Ads (Search, Shopping)").
 * Splitting on commas once broke such skills in two on an untouched save.
 */
export const skillsText = (items: string[]) => items.join('\n')

export const readSkills = (text: string) =>
  text
    .split('\n')
    .map((i) => i.trim())
    .filter(Boolean)
