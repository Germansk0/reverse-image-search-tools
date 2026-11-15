/** Preserve selected File objects while allowing the same file to be chosen again. */
export function consumeSelectedFiles(input) {
  const files = Array.from(input.files || []);
  input.value = '';
  return files;
}
