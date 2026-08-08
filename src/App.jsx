import React, { useState, useEffect, useMemo } from 'react';
import { Users, Plus, Receipt, Calculator, ArrowRight, Trash2, Home, FolderOpen, Edit2, CheckSquare, LogOut, Share2, X } from 'lucide-react';
import { supabase } from './supabaseClient';
import { calculateBalances } from './calculator';
import './index.css';

function App() {
  // Auth state
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // Activity Selection State
  const [activities, setActivities] = useState([]);
  const [currentActivity, setCurrentActivity] = useState(null);
  const [newActivityName, setNewActivityName] = useState('');
  const [isEditingActivityName, setIsEditingActivityName] = useState(false);
  const [editActivityName, setEditActivityName] = useState('');

  // Internal Tabs State (families, expenses, settlement)
  const [activeTab, setActiveTab] = useState('families');
  
  // Data States
  const [families, setFamilies] = useState([]);
  const [expenses, setExpenses] = useState([]);

  // Form States
  const [newFamilyName, setNewFamilyName] = useState('');
  const [newFamilyMembers, setNewFamilyMembers] = useState(1);
  const [newExpName, setNewExpName] = useState('');
  const [newExpAmount, setNewExpAmount] = useState('');
  const [newExpPayer, setNewExpPayer] = useState('');
  const [newExpParticipants, setNewExpParticipants] = useState([]);
  const [editingExpId, setEditingExpId] = useState(null);

  // Share Modal State
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [sharedUsers, setSharedUsers] = useState([]);

  // Check auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchActivities = async () => {
    if (!session?.user) return;
    const { data, error } = await supabase.from('activities').select('*').order('created_at', { ascending: false });
    if (!error && data) setActivities(data);
  };

  // Fetch Activities when session changes and setup subscriptions
  useEffect(() => {
    if (session?.user) {
      fetchActivities();

      const actsSub = supabase.channel('public:activities')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, fetchActivities)
        .subscribe();

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          fetchActivities();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        supabase.removeChannel(actsSub);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [session]);

  const createActivity = async (e) => {
    e.preventDefault();
    if (!newActivityName || !session?.user) return;
    const { data, error } = await supabase.from('activities').insert([{ 
      name: newActivityName,
      owner_id: session.user.id,
      owner_email: session.user.email
    }]).select();
    if (!error && data) {
      setActivities([data[0], ...activities]);
      setNewActivityName('');
    } else if (error) {
      alert("创建失败: " + error.message);
    }
  };

  const saveActivityName = async (e) => {
    e.preventDefault();
    if (!editActivityName.trim()) return;
    
    setCurrentActivity(prev => ({ ...prev, name: editActivityName }));
    setActivities(prev => prev.map(a => a.id === currentActivity.id ? { ...a, name: editActivityName } : a));
    setIsEditingActivityName(false);
    
    await supabase.from('activities').update({ name: editActivityName }).eq('id', currentActivity.id);
  };

  const deleteActivity = async (id, e) => {
    e.stopPropagation();
    if (window.confirm('确定要删除这个账本吗？删除后里面的家庭和账单会被全部清空且无法恢复！')) {
      setActivities(prev => prev.filter(a => a.id !== id));
      await supabase.from('activities').delete().eq('id', id);
      if (currentActivity && currentActivity.id === id) {
        setCurrentActivity(null);
        setFamilies([]);
        setExpenses([]);
      }
    }
  };

  // When currentActivity changes, fetch its data and set up realtime subscriptions
  useEffect(() => {
    if (!currentActivity) return;

    const fetchActivityData = async () => {
      const [famsRes, expsRes] = await Promise.all([
        supabase.from('families').select('*').eq('activity_id', currentActivity.id).order('created_at', { ascending: true }),
        supabase.from('expenses').select('*').eq('activity_id', currentActivity.id).order('created_at', { ascending: true })
      ]);
      if (famsRes.data) setFamilies(famsRes.data);
      if (expsRes.data) setExpenses(expsRes.data);
    };

    fetchActivityData();

    // Setup Realtime subscriptions
    const famsSub = supabase.channel('public:families')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'families' }, fetchActivityData)
      .subscribe();

    const expsSub = supabase.channel('public:expenses')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchActivityData)
      .subscribe();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchActivityData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      supabase.removeChannel(famsSub);
      supabase.removeChannel(expsSub);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentActivity]);

  // Share functionality
  useEffect(() => {
    if (showShareModal && currentActivity) {
      fetchSharedUsers();
    }
  }, [showShareModal, currentActivity]);

  const fetchSharedUsers = async () => {
    const { data } = await supabase.from('activity_shares').select('*').eq('activity_id', currentActivity.id);
    if (data) setSharedUsers(data);
  };

  const shareActivity = async (e) => {
    e.preventDefault();
    if (!shareEmail.trim()) return;
    const { data, error } = await supabase.from('activity_shares').insert([{
      activity_id: currentActivity.id,
      shared_with_email: shareEmail.trim()
    }]).select();
    if (data) {
      setSharedUsers([...sharedUsers, data[0]]);
      setShareEmail('');
    } else if (error) {
      alert('分享失败: (不能重复分享给同一个人) ' + error.message);
    }
  };

  const removeShare = async (id) => {
    setSharedUsers(prev => prev.filter(s => s.id !== id));
    await supabase.from('activity_shares').delete().eq('id', id);
  };

  const { balances, transactions } = useMemo(() => calculateBalances(families, expenses), [families, expenses]);

  // --- Actions ---
  const addFamily = async (e) => {
    e.preventDefault();
    if (!newFamilyName) return;
    const { data } = await supabase.from('families').insert([{
      activity_id: currentActivity.id,
      name: newFamilyName,
      members: Number(newFamilyMembers)
    }]).select();
    if (data) {
      setFamilies(prev => [...prev, data[0]]);
    }
    setNewFamilyName('');
    setNewFamilyMembers(1);
  };

  const deleteFamily = async (id) => {
    setFamilies(prev => prev.filter(f => f.id !== id));
    await supabase.from('families').delete().eq('id', id);
  };

  const saveExpense = async (e) => {
    e.preventDefault();
    if (!newExpName || !newExpAmount || !newExpPayer || newExpParticipants.length === 0) return;
    
    if (editingExpId) {
      setExpenses(prev => prev.map(exp => exp.id === editingExpId ? {
        ...exp,
        name: newExpName,
        amount: Number(newExpAmount),
        payer_id: newExpPayer,
        participant_ids: newExpParticipants
      } : exp));
      
      await supabase.from('expenses').update({
        name: newExpName,
        amount: Number(newExpAmount),
        payer_id: newExpPayer,
        participant_ids: newExpParticipants
      }).eq('id', editingExpId);
    } else {
      const { data } = await supabase.from('expenses').insert([{
        activity_id: currentActivity.id,
        name: newExpName,
        amount: Number(newExpAmount),
        payer_id: newExpPayer,
        participant_ids: newExpParticipants
      }]).select();
      
      if (data) {
        setExpenses(prev => [...prev, data[0]]);
      }
    }
    
    cancelEditExpense();
  };

  const startEditExpense = (exp) => {
    setEditingExpId(exp.id);
    setNewExpName(exp.name);
    setNewExpAmount(exp.amount.toString());
    setNewExpPayer(exp.payer_id);
    setNewExpParticipants(exp.participant_ids);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditExpense = () => {
    setEditingExpId(null);
    setNewExpName('');
    setNewExpAmount('');
    setNewExpPayer('');
    setNewExpParticipants([]);
  };

  const toggleParticipant = (id) => {
    if (newExpParticipants.includes(id)) {
      setNewExpParticipants(newExpParticipants.filter(p => p !== id));
    } else {
      setNewExpParticipants([...newExpParticipants, id]);
    }
  };

  const selectAllParticipants = (e) => {
    e.preventDefault();
    setNewExpParticipants(families.map(f => f.id));
  };

  const deleteExpense = async (id) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
    await supabase.from('expenses').delete().eq('id', id);
  };

  const goHome = () => {
    setCurrentActivity(null);
    setFamilies([]);
    setExpenses([]);
  };

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return <div className="glass-panel" style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>;
  }

  // --- Render Login ---
  if (!session) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <h1 style={{ marginBottom: '30px' }}>🏖️ AA 算账神器</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>请使用 Google 账号登录以管理和分享账单</p>
        <button onClick={handleLogin} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: 'auto', padding: '12px 24px', fontSize: '1.1rem' }}>
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          使用 Google 登录
        </button>
      </div>
    );
  }

  // --- Render Home (Activity List) ---
  if (!currentActivity) {
    return (
      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>🏖️ AA 算账神器</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {session.user.user_metadata?.avatar_url && (
              <img 
                src={session.user.user_metadata.avatar_url} 
                alt="Avatar" 
                style={{ width: '32px', height: '32px', borderRadius: '50%' }}
                referrerPolicy="no-referrer"
              />
            )}
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {session.user.email}
            </span>
            <button className="btn btn-icon" onClick={handleLogout} title="退出登录" style={{ background: 'rgba(255,255,255,0.5)' }}>
              <LogOut size={20} color="var(--danger-color)"/>
            </button>
          </div>
        </div>
        
        <form onSubmit={createActivity} className="form-group glass-panel" style={{ padding: '20px' }}>
          <h3>创建新账本 / 活动</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input 
              type="text" 
              placeholder="活动名称 (如：周末滑雪)" 
              value={newActivityName}
              onChange={e => setNewActivityName(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }}>
              <Plus size={18} />
            </button>
          </div>
        </form>

        <h3 style={{ marginTop: '20px' }}>所有账本</h3>
        <div className="list-container">
          {activities.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>暂无账本，请先创建一个！</p>
          ) : (
            activities.map(act => {
              const isOwner = act.owner_id === session.user.id;
              return (
                <div key={act.id} className="list-item" onClick={() => setCurrentActivity(act)} style={{ cursor: 'pointer' }}>
                  <div className="item-info" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FolderOpen size={20} color="var(--primary-color)" />
                    <div>
                      <h4 style={{ margin: 0 }}>{act.name}</h4>
                      <span style={{ fontSize: '0.75rem', color: isOwner ? 'var(--primary-color)' : 'var(--text-secondary)' }}>
                        {isOwner ? '我创建的' : `别人分享的 (${act.owner_email})`}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {isOwner && (
                      <button className="btn btn-icon" onClick={(e) => deleteActivity(act.id, e)}>
                        <Trash2 size={18} />
                      </button>
                    )}
                    <ArrowRight size={18} color="var(--text-secondary)" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // --- Render Activity Details ---
  const isOwner = currentActivity.owner_id === session.user.id;

  return (
    <div className="glass-panel">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', gap: '10px' }}>
        <button className="btn btn-icon" onClick={goHome} style={{ background: 'rgba(255,255,255,0.5)' }}>
          <Home size={20} color="var(--primary-color)"/>
        </button>
        {isEditingActivityName ? (
          <form onSubmit={saveActivityName} style={{ display: 'flex', gap: '5px', flex: 1 }}>
            <input 
              type="text" 
              value={editActivityName} 
              onChange={e => setEditActivityName(e.target.value)} 
              autoFocus 
              style={{ flex: 1, padding: '4px 8px' }}
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '4px 12px', width: 'auto' }}>保存</button>
            <button type="button" className="btn" onClick={() => setIsEditingActivityName(false)} style={{ padding: '4px 12px', width: 'auto' }}>取消</button>
          </form>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--primary-color)' }}>{currentActivity.name}</h2>
            <button className="btn btn-icon" onClick={() => { setIsEditingActivityName(true); setEditActivityName(currentActivity.name); }} style={{ color: 'var(--text-secondary)' }}>
              <Edit2 size={16} />
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn" onClick={() => setShowShareModal(true)} style={{ width: 'auto', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '5px', background: 'var(--primary-color)', color: 'white' }}>
            <Share2 size={16} /> 分享
          </button>
          {isOwner && (
            <button className="btn btn-icon" onClick={(e) => deleteActivity(currentActivity.id, e)} style={{ background: 'rgba(255,255,255,0.5)' }}>
              <Trash2 size={20} color="var(--danger-color)" />
            </button>
          )}
        </div>
      </div>

      {showShareModal && (
        <div className="glass-panel" style={{ marginBottom: '20px', background: 'rgba(255,255,255,0.8)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>分享给其他人</h3>
            <button className="btn btn-icon" onClick={() => setShowShareModal(false)}>
              <X size={18} />
            </button>
          </div>
          <form onSubmit={shareActivity} style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <input 
              type="email" 
              placeholder="输入对方的 Google 邮箱" 
              value={shareEmail}
              onChange={e => setShareEmail(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }}>添加</button>
          </form>

          <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>已分享的成员：</h4>
          {sharedUsers.length === 0 ? (
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>尚未分享给任何人</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {sharedUsers.map(user => (
                <div key={user.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', background: 'var(--bg-color)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.9rem' }}>{user.shared_with_email}</span>
                  <button className="btn btn-icon" onClick={() => removeShare(user.id)} style={{ color: 'var(--danger-color)' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      <div className="tabs">
        <div className={`tab ${activeTab === 'families' ? 'active' : ''}`} onClick={() => setActiveTab('families')}>
          <Users size={18} style={{ marginBottom: '-3px', marginRight: '4px' }} /> 家庭
        </div>
        <div className={`tab ${activeTab === 'expenses' ? 'active' : ''}`} onClick={() => setActiveTab('expenses')}>
          <Receipt size={18} style={{ marginBottom: '-3px', marginRight: '4px' }} /> 账单
        </div>
        <div className={`tab ${activeTab === 'settlement' ? 'active' : ''}`} onClick={() => setActiveTab('settlement')}>
          <Calculator size={18} style={{ marginBottom: '-3px', marginRight: '4px' }} /> 结算
        </div>
      </div>

      {/* FAMILIES TAB */}
      {activeTab === 'families' && (
        <div>
          <form onSubmit={addFamily} className="form-group glass-panel" style={{ padding: '20px' }}>
            <h3>添加家庭</h3>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input 
                type="text" 
                placeholder="名称 (如 A家)" 
                value={newFamilyName}
                onChange={e => setNewFamilyName(e.target.value)}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input 
                  type="number" 
                  min="1"
                  placeholder="人数" 
                  value={newFamilyMembers}
                  onChange={e => setNewFamilyMembers(e.target.value)}
                  style={{ width: '80px' }}
                />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>人(用于平摊)</span>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: '10px' }}>
              <Plus size={18} /> 添加
            </button>
          </form>

          <div className="list-container">
            {families.map(f => (
              <div key={f.id} className="list-item">
                <div className="item-info">
                  <h4>{f.name}</h4>
                  <p>{f.members} 人</p>
                </div>
                <button className="btn btn-icon" onClick={() => deleteFamily(f.id)}>
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EXPENSES TAB */}
      {activeTab === 'expenses' && (
        <div>
          <form onSubmit={saveExpense} className="form-group glass-panel" style={{ padding: '20px' }}>
            <h3>{editingExpId ? '修改账单' : '记一笔账'}</h3>
            <input 
              type="text" 
              placeholder="项目名称 (如 吃饭, 租车)" 
              value={newExpName}
              onChange={e => setNewExpName(e.target.value)}
              style={{ marginBottom: '10px' }}
            />
            <input 
              type="number" 
              placeholder="总金额" 
              value={newExpAmount}
              onChange={e => setNewExpAmount(e.target.value)}
              style={{ marginBottom: '10px' }}
            />
            
            <label>谁付款的？</label>
            <select value={newExpPayer} onChange={e => setNewExpPayer(e.target.value)} style={{ marginBottom: '10px' }}>
              <option value="">请选择付款人</option>
              {families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <label style={{ marginBottom: 0 }}>谁参与了？ (按家庭人头平摊)</label>
              <button type="button" className="btn" style={{ padding: '4px 8px', fontSize: '0.8rem', width: 'auto' }} onClick={selectAllParticipants}>
                <CheckSquare size={14} style={{ marginRight: '4px', marginBottom: '-2px' }} /> 全选
              </button>
            </div>
            
            <div className="badges-container" style={{ marginBottom: '15px' }}>
              {families.map(f => (
                <div 
                  key={f.id} 
                  className={`badge ${newExpParticipants.includes(f.id) ? 'selected' : ''}`}
                  onClick={() => toggleParticipant(f.id)}
                >
                  {f.name} ({f.members}人)
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" className="btn btn-primary">
                {editingExpId ? <Edit2 size={18} /> : <Plus size={18} />} {editingExpId ? '保存修改' : '记账'}
              </button>
              {editingExpId && (
                <button type="button" className="btn" onClick={cancelEditExpense} style={{ background: 'var(--bg-color)', color: 'var(--text-color)' }}>
                  取消
                </button>
              )}
            </div>
          </form>

          <div className="list-container">
            {expenses.map(e => {
              const payer = families.find(f => f.id === e.payer_id)?.name || '未知';
              const participantNames = e.participant_ids
                .map(id => families.find(f => f.id === id)?.name)
                .filter(Boolean)
                .join(', ');
                
              return (
                <div key={e.id} className="list-item">
                  <div className="item-info">
                    <h4>{e.name}</h4>
                    <p>{payer} 付款 • 参与: {participantNames || '无'}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="item-amount">¥{e.amount}</div>
                    <button className="btn btn-icon" onClick={() => startEditExpense(e)} style={{ color: 'var(--primary-color)' }}>
                      <Edit2 size={18} />
                    </button>
                    <button className="btn btn-icon" onClick={() => deleteExpense(e.id)}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SETTLEMENT TAB */}
      {activeTab === 'settlement' && (
        <div>
          <h3>最优结算方案</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '0.9rem' }}>
            根据每个人头的花费，计算出的最少转账次数方案。
          </p>

          {transactions.length === 0 ? (
            <div className="glass-panel" style={{ textAlign: 'center' }}>
              <p>🎉 账目已结清，大家互不相欠！</p>
            </div>
          ) : (
            transactions.map((tx, idx) => (
              <div key={idx} className="transaction-card">
                <div className="transaction-parties">
                  <span>{tx.from.name}</span>
                  <ArrowRight className="transaction-arrow" size={24} />
                  <span>{tx.to.name}</span>
                </div>
                <div className="transaction-amount">¥{tx.amount}</div>
              </div>
            ))
          )}

          <h3 style={{ marginTop: '30px' }}>家庭净余额</h3>
          <div className="glass-panel" style={{ padding: '15px' }}>
            {families.map(f => {
              const bal = balances[f.id] || 0;
              return (
                <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>{f.name}</span>
                  <span style={{ 
                    color: bal > 0 ? 'var(--success-color)' : bal < 0 ? 'var(--danger-color)' : 'var(--text-secondary)',
                    fontWeight: 'bold' 
                  }}>
                    {bal > 0 ? '+' : ''}{bal.toFixed(2)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
