export const dangerous = () => {
  // TODO: Fix this security hole
  console.log('This is a leaks');
}
// meaningful change to trigger diff
console.log('This is definitely a violation');
console.log('This should be blocked by the cloud');
