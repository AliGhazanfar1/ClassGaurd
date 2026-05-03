const API_URL = '/api';
let socket;
let currentSessionId = null;
let lastSessionId = null;
let html5QrcodeScanner = null;

const app = {
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),

  init() {
    // Listen for fullscreen exits to restore CSS gracefully
    document.addEventListener('fullscreenchange', () => {
        const wrapper = document.getElementById('qr-wrapper');
        const img = document.getElementById('dynamic-qr-img');
        if (!document.fullscreenElement && wrapper) {
            wrapper.style.backgroundColor = 'white';
            wrapper.style.display = 'block';
            wrapper.style.alignItems = 'initial';
            wrapper.style.justifyContent = 'initial';
            if (img) {
                img.style.width = '250px';
                img.style.height = '250px';
            }
        }
    });

    this.checkAuth();
  },

  getDeviceTicket() {
    let ticket = localStorage.getItem('classguard_device_ticket');
    if (!ticket) {
      ticket = 'ck_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('classguard_device_ticket', ticket);
    }
    return ticket;
  },

  async getDeviceFingerprint() {
    if (!window.fpPromise) return 'unknown_fp';
    try {
      const fp = await window.fpPromise;
      const result = await fp.get();
      return result.visitorId;
    } catch (err) {
      return 'unknown_fp';
    }
  },

  showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type === 'error' ? 'error' : ''}`;
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
  },

  async apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    const res = await fetch(`${API_URL}${endpoint}`, config);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  },

  checkAuth() {
    if (this.token && this.user) {
      document.getElementById('nav-actions').style.display = 'block';
      document.getElementById('user-name-display').textContent = `Hi, ${this.user.name}`;

      this.switchSection(this.user.role === 'admin' ? 'admin' : 'student');

      if (this.user.role === 'admin') {
        document.getElementById('btn-all-students').style.display = 'inline-block';
        this.initAdmin();
      } else {
        document.getElementById('btn-all-students').style.display = 'none';
        this.initStudent();
      }
    } else {
      document.getElementById('nav-actions').style.display = 'none';
      this.switchSection('auth');
    }
  },

  switchSection(sectionName) {
    document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
    document.getElementById(`${sectionName}-section`).classList.add('active');
  },

  toggleAuthMode(mode) {
    if (mode === 'register') {
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('register-form').style.display = 'block';
    } else {
      document.getElementById('login-form').style.display = 'block';
      document.getElementById('register-form').style.display = 'none';
    }
  },

  handleRoleChange() {
    const role = document.getElementById('reg-role').value;
    const stdIdGroup = document.getElementById('student-id-group');
    stdIdGroup.style.display = role === 'admin' ? 'none' : 'block';
  },

  async login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try {
      const { token, data } = await this.apiCall('/auth/login', 'POST', { email, password });
      this.setLocalAuth(token, data.user);
      this.showToast('Login successful!');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async register() {
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const role = document.getElementById('reg-role').value;
    const studentId = document.getElementById('reg-studentid').value;

    try {
      const { token, data } = await this.apiCall('/auth/register', 'POST', { name, email, password, role, studentId });
      this.setLocalAuth(token, data.user);
      this.showToast('Registration successful!');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  setLocalAuth(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    this.checkAuth();
  },

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.token = null;
    this.user = null;
    if (socket) socket.disconnect();

    // Reset scanner
    if (html5QrcodeScanner) {
      html5QrcodeScanner.clear();
      html5QrcodeScanner = null;
    }

    // Forcebly reset the DOM UI elements so Student B has a fresh experience
    const reader = document.getElementById('reader');
    if (reader) reader.style.display = 'inline-block';

    const successMsg = document.getElementById('scan-success-msg');
    if (successMsg) {
      successMsg.style.display = 'none';
      // Reset to original green look just in case it was red-blocked previously
      successMsg.innerHTML = `
        <h3 style="color: var(--success); font-size: 1.5rem;">✅ Attendance Marked!</h3>
        <p style="color: var(--text-muted); margin-top: 10px;">You may now close this window or lock your phone.</p>
      `;
    }

    this.checkAuth();
  },

  /* ADMIN METHODS */
  async initAdmin() {
    socket = io();

    // Check if there is an active session
    try {
      const res = await this.apiCall('/admin/session/active');
      if (res.data.session) {
        currentSessionId = res.data.session.id;
        lastSessionId = res.data.session.id;
        this.activateSessionView();
        this.loadAttendanceList();
      }
    } catch (err) { }

    socket.on('new-qr', (data) => {
      // support both old string and new object
      const qrDataUrl = data.qrDataUrl || data;
      const token = data.token || '';
      document.getElementById('dynamic-qr-img').src = qrDataUrl;
    });

    socket.on('attendance-marked', (studentData) => {
      this.addStudentToUI(studentData, true);
    });

    socket.on('session-ended', () => {
      this.deactivateSessionView();
      this.showToast('Session was ended remotely.', 'error');
    });
  },

  async startSession() {
    try {
      const res = await this.apiCall('/admin/session', 'POST');
      currentSessionId = res.data.session.id;
      lastSessionId = res.data.session.id;
      this.activateSessionView();
      document.getElementById('admin-student-list').innerHTML = ''; // Clear old items
      this.showToast('Session Started (IP Locked to Network)!', 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async stopSession() {
    if (!currentSessionId) return;
    try {
      await this.apiCall(`/admin/session/${currentSessionId}/stop`, 'PUT');
      this.deactivateSessionView();
      this.showToast('Session stopped.');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  activateSessionView() {
    document.getElementById('btn-start-session').style.display = 'none';
    document.getElementById('btn-stop-session').style.display = 'block';
    document.getElementById('qr-display').style.display = 'block';
    if (socket) socket.emit('join-session', currentSessionId);
  },

  deactivateSessionView() {
    document.getElementById('btn-start-session').style.display = 'block';
    document.getElementById('btn-stop-session').style.display = 'none';
    document.getElementById('qr-display').style.display = 'none';
    if(socket && currentSessionId) socket.emit('leave-session', currentSessionId);
    currentSessionId = null;
  },

  toggleFullscreenQR() {
    const wrapper = document.getElementById('qr-wrapper');
    const img = document.getElementById('dynamic-qr-img');
    if (!wrapper || !img) return;

    if (!document.fullscreenElement) {
        wrapper.requestFullscreen().catch(err => {
            this.showToast(`Error starting fullscreen: ${err.message}`, 'error');
        });
        wrapper.style.backgroundColor = 'white';
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.justifyContent = 'center';
        img.style.width = '85vmin';
        img.style.height = '85vmin';
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
  },

  async loadAttendanceList() {
    if (!currentSessionId) return;
    try {
      const res = await this.apiCall(`/admin/session/${currentSessionId}/attendance`);
      const list = document.getElementById('admin-student-list');
      list.innerHTML = '';
      res.data.attendances.forEach(att => {
        this.addStudentToUI({
          name: att.student.name,
          studentId: att.student.studentId,
          timestamp: att.timestamp
        }, false);
      });
      if (res.data.attendances.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted);">No students marked yet.</p>';
      }
    } catch (err) {
      console.error(err);
    }
  },

  addStudentToUI(studentData, notify = false) {
    const list = document.getElementById('admin-student-list');
    if (list.innerHTML.includes('No students marked yet')) {
      list.innerHTML = '';
    }
    const time = new Date(studentData.timestamp).toLocaleTimeString();
    const html = `
      <div class="student-row">
        <div>
          <strong style="color: var(--text-main); display: block;">${studentData.name}</strong>
          <span style="font-size: 0.85rem; color: var(--text-muted);">${studentData.studentId || 'No ID'}</span>
        </div>
        <div style="font-size: 0.9rem; color: var(--success); display: flex; align-items: center;">
          ✅ ${time}
        </div>
      </div>
    `;
    list.insertAdjacentHTML('afterbegin', html);
    if (notify) this.showToast(`${studentData.name} marked attendance!`);
  },

  exportAttendance() {
    const targetSession = currentSessionId || lastSessionId;
    if (!targetSession) return this.showToast('No session selected to export', 'error');
    const url = `${API_URL}/admin/session/${targetSession}/export`;

    // Create temporary download link with Auth header info appended locally via fetch as Blob
    fetch(url, { headers: { 'Authorization': `Bearer ${this.token}` } })
      .then(res => {
        if (!res.ok) throw new Error('Export failed');
        return res.blob()
      })
      .then(blob => {
        const a = document.createElement('a');
        a.href = window.URL.createObjectURL(blob);
        a.download = `attendance_session_${targetSession}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      })
      .catch(err => this.showToast(err.message, 'error'));
  },

  exportMasterAttendance() {
    const url = `${API_URL}/admin/export-all`;

    fetch(url, { headers: { 'Authorization': `Bearer ${this.token}` } })
      .then(res => {
        if (!res.ok) throw new Error('Export failed');
        return res.blob();
      })
      .then(blob => {
        const a = document.createElement('a');
        a.href = window.URL.createObjectURL(blob);
        a.download = `master_attendance_report.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      })
      .catch(err => this.showToast(err.message, 'error'));
  },

  async showAllStudents() {
    try {
      const res = await this.apiCall('/admin/students');
      const list = document.getElementById('all-students-list');
      list.innerHTML = '';
      if(res.data.students.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted);">No students found.</p>';
      } else {
        res.data.students.forEach(student => {
          list.insertAdjacentHTML('beforeend', `
            <div style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong style="color: var(--text-main); display: block;">${student.name}</strong>
                <span style="font-size: 0.85rem; color: var(--text-muted);">${student.email}</span>
              </div>
              <span style="color: var(--primary); font-weight: 600;">${student.studentId || 'No ID'}</span>
            </div>
          `);
        });
      }
      document.getElementById('students-modal').style.display = 'flex';
    } catch(err) {
      this.showToast(err.message, 'error');
    }
  },

  /* STUDENT METHODS */
  initStudent() {
    // Re-init scanner if DOM is recreated/shown
    setTimeout(() => {
      if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
      }

      let lastScanTime = 0;

      html5QrcodeScanner.render((decodedText) => {
        // Debounce scanning
        if (Date.now() - lastScanTime < 3000) return;
        lastScanTime = Date.now();

        this.submitAttendance(decodedText);
      }, (errorMessage) => {
        // Background scan errors, ignore
      });
    }, 500);
  },



  async submitAttendance(qrToken) {
    try {
      this.showToast('Generating Security Checks...', 'success');
      const deviceTicket = this.getDeviceTicket();
      const deviceFingerprint = await this.getDeviceFingerprint();

      const res = await this.apiCall('/attendance/mark', 'POST', {
        qrToken,
        deviceTicket,
        deviceFingerprint
      });

      // Stop scanner visually and unhook camera
      if (html5QrcodeScanner) {
          html5QrcodeScanner.clear();
          html5QrcodeScanner = null;
      }

      document.getElementById('scan-success-msg').style.display = 'block';
      this.showToast('Attendance Marked Successfully!');

    } catch (err) {
      if (err.message.includes('already recorded an attendance today')) {
        document.getElementById('reader').style.display = 'none';
        if (html5QrcodeScanner) {
            html5QrcodeScanner.clear();
            html5QrcodeScanner = null;
        }
        document.getElementById('scan-success-msg').innerHTML = `
          <h3 style="color: var(--danger); font-size: 1.5rem;">🚫 Device Locked</h3>
          <p style="color: var(--text-muted); margin-top: 10px;">Attendance was already marked from this physical device for this session! Sharing devices is strictly prohibited.</p>
        `;
        document.getElementById('scan-success-msg').style.display = 'block';
      } else if (err.message.includes('already marked')) {
        document.getElementById('reader').style.display = 'none';
        if (html5QrcodeScanner) {
            html5QrcodeScanner.clear();
            html5QrcodeScanner = null;
        }
        document.getElementById('scan-success-msg').innerHTML = `
          <h3 style="color: var(--primary); font-size: 1.5rem;">✅ Already Marked</h3>
          <p style="color: var(--text-muted); margin-top: 10px;">Your attendance is already secured for this session.</p>
        `;
        document.getElementById('scan-success-msg').style.display = 'block';
      } else {
        this.showToast(err.message, 'error');
      }
    }
  }
};

window.onload = () => app.init();
