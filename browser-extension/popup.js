const $ = (id) => document.getElementById(id)

function showStatus(message, isError = false) {
  $('status').textContent = message
  $('status').style.color = isError ? '#b91c1c' : '#475569'
}

chrome.runtime.sendMessage({ type: 'get-config' }, (response) => {
  if (chrome.runtime.lastError || !response?.ok) return
  $('baseUrl').value = response.config.baseUrl || ''
  $('username').value = response.config.username || ''
  if (response.config.enabled) showStatus('同步已开启')
})

$('login').addEventListener('click', () => {
  const baseUrl = $('baseUrl').value.trim()
  const username = $('username').value.trim()
  const password = $('password').value
  if (!baseUrl || !username || !password) {
    showStatus('请填写导航页地址、账号和密码', true)
    return
  }
  showStatus('正在登录...')
  chrome.runtime.sendMessage({ type: 'login', baseUrl, username, password }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      showStatus(response?.error || '登录失败', true)
      return
    }
    $('password').value = ''
    showStatus('已开启同步；只处理之后新增的浏览器书签')
  })
})

$('disable').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'clear-session' }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      showStatus(response?.error || '操作失败', true)
      return
    }
    showStatus('同步已暂停，会话已清除')
  })
})
