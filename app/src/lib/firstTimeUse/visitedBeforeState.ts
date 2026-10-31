const VISITED_BEFORE_KEY = 'margins:visited-before';
let visitedBefore = localStorage.getItem(VISITED_BEFORE_KEY) === 'true';
export function setVisitedBefore() {
  visitedBefore = true;
  localStorage.setItem(VISITED_BEFORE_KEY, 'true');
}
export function getVisitedBefore() {
  return visitedBefore;
}
