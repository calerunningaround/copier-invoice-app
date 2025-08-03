const getHeaders = () => ({
  'Content-Type': 'application/json',
  'x-session': localStorage.getItem('authToken')
});