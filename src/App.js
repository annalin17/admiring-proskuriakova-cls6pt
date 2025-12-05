import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Tent,
  ShoppingBag,
  Flame,
  Utensils,
  Plus,
  Backpack,
  CheckCircle2,
  Sparkles,
  X,
  ChevronRight,
  Receipt,
  Calculator,
  ArrowRightLeft,
  User,
  DollarSign,
  Tag,
  ArrowRight,
  Settings,
  ExternalLink,
  Trash2,
  CheckSquare,
  RotateCcw,
  LogOut,
  Users,
  UserMinus,
  AlertTriangle,
  Map as MapIcon,
  Calendar,
  Copy,
  LogIn,
  PackagePlus,
  Edit2,
  Save,
  Globe,
} from "lucide-react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  setDoc,
  getDocs,
  getDoc,
} from "firebase/firestore";

// --- Firebase 初始化 ---
const firebaseConfig = {
  apiKey: "AIzaSyDHBrA_Wsxy39XrqqS6ETfWqHyptrt5gnk",
  authDomain: "mycampingtrip-6b183.firebaseapp.com",
  projectId: "mycampingtrip-6b183",
  storageBucket: "mycampingtrip-6b183.firebasestorage.app",
  messagingSenderId: "774810390642",
  appId: "1:774810390642:web:e88eac3a55b833652232eb",
  measurementId: "G-SXWQG30E59",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "annakelly");

// --- 預設常數 ---
const DEFAULT_CATEGORIES = ["裝備", "食材"];
const BASE_TABS = ["全部"];

// 初始範例資料
const SEED_DATA = [
  {
    category: "裝備",
    name: "客廳帳/天幕",
    assignedTo: null,
    assignedName: null,
    isPacked: false,
    note: "需含營柱",
    cost: 0,
  },
  {
    category: "裝備",
    name: "卡式爐 x 2",
    assignedTo: null,
    assignedName: null,
    isPacked: false,
    note: "記得帶瓦斯罐",
    cost: 0,
  },
  {
    category: "食材",
    name: "好市多牛肉片",
    assignedTo: null,
    assignedName: null,
    isPacked: false,
    note: "約 1kg",
    cost: 0,
  },
  {
    category: "食材",
    name: "大桶水 (6000ml)",
    assignedTo: null,
    assignedName: null,
    isPacked: false,
    note: "買兩桶",
    cost: 0,
  },
];

const App = () => {
  const [user, setUser] = useState(null);
  const [userName, setUserName] = useState("");
  const [inputName, setInputName] = useState("");

  // --- 多團管理狀態 ---
  const [currentGroupId, setCurrentGroupId] = useState(null);
  const [currentGroupName, setCurrentGroupName] = useState("");
  const [myGroups, setMyGroups] = useState([]); // 本地歷史紀錄
  const [publicGroups, setPublicGroups] = useState([]); // 雲端公開列表
  const [view, setView] = useState("login");

  // --- App 內部狀態 ---
  const [items, setItems] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);

  const [activeTab, setActiveTab] = useState("pool");
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [toast, setToast] = useState(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());

  // Modals
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showItemCostModal, setShowItemCostModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  // Inputs
  const [newGroupName, setNewGroupName] = useState("");
  const [joinInputId, setJoinInputId] = useState("");
  const [expenseForm, setExpenseForm] = useState({
    item: "",
    amount: "",
    category: "食材",
  });
  const [itemCostForm, setItemCostForm] = useState({
    id: null,
    name: "",
    amount: "",
  });
  const [newItemForm, setNewItemForm] = useState({
    name: "",
    category: "裝備",
    note: "",
  });
  const [newCategoryName, setNewCategoryName] = useState("");

  const heartbeatRef = useRef(null);

  // --- Auth 初始化 ---
  useEffect(() => {
    const initAuth = async () => {
      if (!auth.currentUser)
        await signInAnonymously(auth).catch((e) => console.error(e));
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        const savedName = localStorage.getItem("camp_username");
        const savedGroups = JSON.parse(
          localStorage.getItem("camp_my_groups") || "[]"
        );

        if (savedName) {
          setUserName(savedName);
          setMyGroups(savedGroups);
          setView("lobby");
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem("camp_my_groups", JSON.stringify(myGroups));
  }, [myGroups]);

  // --- Sync Public Groups (大廳列表) ---
  useEffect(() => {
    const q = collection(db, "artifacts", "global_data", "public_groups");
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loaded = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      loaded.sort(
        (a, b) =>
          (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)
      );
      setPublicGroups(loaded);
    });
    return () => unsubscribe();
  }, []);

  // --- Sync Data (Group Specific) ---
  useEffect(() => {
    if (!user || !currentGroupId) return;

    // 1. 同步分類
    const settingsRef = doc(
      db,
      "artifacts",
      currentGroupId,
      "public",
      "data",
      "settings",
      "config"
    );
    const unsubSettings = onSnapshot(
      settingsRef,
      (docSnap) => {
        if (docSnap.exists() && docSnap.data().categories) {
          setCategories(docSnap.data().categories);
        } else {
          setCategories(DEFAULT_CATEGORIES);
        }
      },
      () => setCategories(DEFAULT_CATEGORIES)
    );

    // 2. 同步成員
    const qPart = collection(
      db,
      "artifacts",
      currentGroupId,
      "public",
      "data",
      "participants"
    );
    const unsubPart = onSnapshot(qPart, (snapshot) => {
      const loaded = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        isOnline:
          Date.now() - (doc.data().lastSeen?.toMillis() || 0) < 5 * 60 * 1000,
      }));
      setParticipants(loaded);
    });

    // 3. 同步物品
    const qItems = collection(
      db,
      "artifacts",
      currentGroupId,
      "public",
      "data",
      "items"
    );
    const unsubItems = onSnapshot(qItems, (snapshot) => {
      const loaded = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setItems(loaded);
    });

    // 4. 同步費用
    const qExp = collection(
      db,
      "artifacts",
      currentGroupId,
      "public",
      "data",
      "expenses"
    );
    const unsubExp = onSnapshot(qExp, (snapshot) => {
      const loaded = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      loaded.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setExpenses(loaded);
    });

    return () => {
      unsubSettings();
      unsubPart();
      unsubItems();
      unsubExp();
    };
  }, [user, currentGroupId]);

  const updatePresence = async () => {
    if (!user || !currentGroupId || !userName) return;
    try {
      await setDoc(
        doc(
          db,
          "artifacts",
          currentGroupId,
          "public",
          "data",
          "participants",
          user.uid
        ),
        {
          name: userName,
          lastSeen: serverTimestamp(),
          uid: user.uid,
        },
        { merge: true }
      );
    } catch (e) {}
  };

  useEffect(() => {
    if (view === "trip" && currentGroupId) {
      updatePresence();
      heartbeatRef.current = setInterval(updatePresence, 60000);
    }
    return () => clearInterval(heartbeatRef.current);
  }, [view, currentGroupId]);

  // --- 成員去重複邏輯 ---
  const uniqueParticipants = useMemo(() => {
    const map = new Map(); // 這裡使用 JS 內建 Map
    participants.forEach((p) => {
      const existing = map.get(p.name);
      if (!existing || (p.isOnline && !existing.isOnline)) {
        map.set(p.name, p);
      }
    });
    return Array.from(map.values()).sort(
      (a, b) => (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0)
    );
  }, [participants]);

  // --- Handlers ---
  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2000);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (!inputName.trim()) return;
    setUserName(inputName);
    localStorage.setItem("camp_username", inputName);
    setView("lobby");
  };

  const handleLogout = () => {
    if (!window.confirm("確定要登出嗎？")) return;
    localStorage.removeItem("camp_username");
    setUserName("");
    setMyGroups([]);
    setView("login");
    setUser(null);
    signOut(auth);
    signInAnonymously(auth);
  };

  const createNewGroup = async () => {
    const name =
      newGroupName.trim() || `露營團 ${new Date().toLocaleDateString()}`;
    const newId = `camp-${Math.random().toString(36).substr(2, 6)}`;
    setMyGroups([...myGroups, { id: newId, name: name }]);

    try {
      await setDoc(
        doc(db, "artifacts", newId, "public", "data", "metadata", "info"),
        { groupName: name, createdAt: serverTimestamp() }
      );
      await setDoc(
        doc(db, "artifacts", newId, "public", "data", "settings", "config"),
        { categories: DEFAULT_CATEGORIES }
      );
      await setDoc(
        doc(db, "artifacts", "global_data", "public_groups", newId),
        {
          name: name,
          id: newId,
          createdAt: serverTimestamp(),
          createdBy: userName,
        }
      );

      const batch = writeBatch(db);
      SEED_DATA.forEach((item) => {
        const ref = doc(
          collection(db, "artifacts", newId, "public", "data", "items")
        );
        batch.set(ref, item);
      });
      await batch.commit();
      enterGroup(newId, name);
      setShowJoinModal(false);
      setNewGroupName("");
    } catch (e) {
      console.error("Create failed", e);
      showToast("建立失敗", "error");
    }
  };

  const joinGroupFromList = (group) => {
    if (!myGroups.find((g) => g.id === group.id)) {
      setMyGroups([...myGroups, { id: group.id, name: group.name }]);
    }
    enterGroup(group.id, group.name);
  };

  const joinGroup = () => {
    if (!joinInputId.trim()) return;
    const gid = joinInputId.trim();
    const newGroup = { id: gid, name: `露營團 (${gid})` };
    if (!myGroups.find((g) => g.id === gid))
      setMyGroups([...myGroups, newGroup]);
    enterGroup(gid, newGroup.name);
    setShowJoinModal(false);
    setJoinInputId("");
  };

  const enterGroup = (gid, gname) => {
    setCurrentGroupId(gid);
    setCurrentGroupName(gname);
    setView("trip");
    setActiveTab("pool");
  };
  const leaveGroup = () => {
    setView("lobby");
    setCurrentGroupId(null);
    setCurrentGroupName("");
  };

  const handleDeleteGroup = async (e, gid, gname) => {
    e.stopPropagation();
    if (
      !window.confirm(
        `確定要永久刪除「${gname}」嗎？\n\n注意：這會永久刪除雲端上的所有資料！`
      )
    )
      return;

    try {
      const batch = writeBatch(db);

      // 刪除公開列表記錄
      batch.delete(doc(db, "artifacts", "global_data", "public_groups", gid));

      // 刪除子集合中的資料
      const subCollections = ["items", "expenses", "participants"];
      for (const col of subCollections) {
        const q = collection(db, "artifacts", gid, "public", "data", col);
        const snapshot = await getDocs(q);
        snapshot.forEach((doc) => batch.delete(doc.ref));
      }

      // 刪除內容
      batch.delete(
        doc(db, "artifacts", gid, "public", "data", "metadata", "info")
      );
      batch.delete(
        doc(db, "artifacts", gid, "public", "data", "settings", "config")
      );

      await batch.commit();

      setMyGroups(myGroups.filter((g) => g.id !== gid));
      showToast("露營團已刪除", "success");
    } catch (err) {
      setMyGroups(myGroups.filter((g) => g.id !== gid));
      showToast("已從列表移除", "success");
    }
  };

  const handleClaim = async (item) => {
    if (isSelectionMode) {
      toggleItemSelection(item.id);
      return;
    }
    const docRef = doc(
      db,
      "artifacts",
      currentGroupId,
      "public",
      "data",
      "items",
      item.id
    );
    const isMine = item.assignedName === userName;
    if (item.assignedName && !isMine) return;
    await updateDoc(docRef, {
      assignedTo: isMine ? null : user.uid,
      assignedName: isMine ? null : userName,
      isPacked: false,
    });
    showToast(isMine ? "已取消" : "已認領", "info");
  };

  const handleTogglePacked = async (item) => {
    const docRef = doc(
      db,
      "artifacts",
      currentGroupId,
      "public",
      "data",
      "items",
      item.id
    );
    await updateDoc(docRef, { isPacked: !item.isPacked });
  };

  const handleOpenAddItemModal = () => {
    setNewItemForm({ name: "", category: "裝備", note: "" });
    setShowAddItemModal(true);
  };
  const handleSubmitNewItem = async (e) => {
    e.preventDefault();
    if (!newItemForm.name) return;
    await addDoc(
      collection(db, "artifacts", currentGroupId, "public", "data", "items"),
      {
        ...newItemForm,
        assignedTo: null,
        assignedName: null,
        isPacked: false,
        cost: 0,
      }
    );
    setShowAddItemModal(false);
    showToast("物品已新增");
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || categories.includes(newCategoryName)) return;
    const newCats = [...categories, newCategoryName];
    setCategories(newCats);
    await setDoc(
      doc(
        db,
        "artifacts",
        currentGroupId,
        "public",
        "data",
        "settings",
        "config"
      ),
      { categories: newCats },
      { merge: true }
    );
    setNewCategoryName("");
  };

  const handleDeleteCategory = async (cat) => {
    if (DEFAULT_CATEGORIES.includes(cat)) {
      alert("預設分類不能刪除");
      return;
    }
    if (!window.confirm(`刪除「${cat}」分類？`)) return;
    const newCats = categories.filter((c) => c !== cat);
    setCategories(newCats);
    await setDoc(
      doc(
        db,
        "artifacts",
        currentGroupId,
        "public",
        "data",
        "settings",
        "config"
      ),
      { categories: newCats },
      { merge: true }
    );
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedItems(new Set());
  };
  const toggleItemSelection = (id) => {
    const s = new Set(selectedItems);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedItems(s);
  };
  const selectAll = () => {
    const ids =
      activeTab === "pool"
        ? items.map((i) => i.id)
        : expenses.filter((e) => e.type !== "item").map((e) => e.id);
    setSelectedItems(new Set(ids));
  };
  const handleBatchDelete = async () => {
    if (!window.confirm(`確定刪除 ${selectedItems.size} 項？`)) return;
    const batch = writeBatch(db);
    selectedItems.forEach((id) => {
      if (activeTab === "pool")
        batch.delete(
          doc(db, "artifacts", currentGroupId, "public", "data", "items", id)
        );
      else if (activeTab === "cost") {
        if (id.startsWith("item_"))
          batch.update(
            doc(
              db,
              "artifacts",
              currentGroupId,
              "public",
              "data",
              "items",
              id.replace("item_", "")
            ),
            { cost: 0 }
          );
        else
          batch.delete(
            doc(
              db,
              "artifacts",
              currentGroupId,
              "public",
              "data",
              "expenses",
              id
            )
          );
      }
    });
    await batch.commit();
    setIsSelectionMode(false);
    setSelectedItems(new Set());
    showToast("刪除成功");
  };

  const handleImportSeedData = async () => {
    if (!window.confirm("確定要匯入範例資料嗎？")) return;
    const batch = writeBatch(db);
    SEED_DATA.forEach((item) =>
      batch.set(
        doc(
          collection(db, "artifacts", currentGroupId, "public", "data", "items")
        ),
        item
      )
    );
    await batch.commit();
    showToast("匯入成功", "success");
  };

  const handleKickUser = async (name) => {
    if (!window.confirm(`確定移除成員 ${name}？`)) return;
    const q = query(
      collection(
        db,
        "artifacts",
        currentGroupId,
        "public",
        "data",
        "participants"
      )
    );
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.forEach((doc) => {
      if (doc.data().name === name) batch.delete(doc.ref);
    });
    await batch.commit();
    showToast("成員已移除", "success");
  };

  const handleResetTrip = async () => {
    if (!window.confirm("確定要清空本團所有資料嗎？")) return;
    const batch = writeBatch(db);
    (
      await getDocs(
        collection(db, "artifacts", currentGroupId, "public", "data", "items")
      )
    ).forEach((d) => batch.delete(d.ref));
    (
      await getDocs(
        collection(
          db,
          "artifacts",
          currentGroupId,
          "public",
          "data",
          "expenses"
        )
      )
    ).forEach((d) => batch.delete(d.ref));
    (
      await getDocs(
        collection(
          db,
          "artifacts",
          currentGroupId,
          "public",
          "data",
          "participants"
        )
      )
    ).forEach((d) => batch.delete(d.ref));
    await batch.commit();
    setShowSettingsModal(false);
    showToast("資料已重置", "success");
    updatePresence();
  };

  // --- Handlers for modals ---
  const handleOpenExpenseModal = () => {
    setExpenseForm({ item: "", amount: "", category: "食材" });
    setShowExpenseModal(true);
  };

  const handleSubmitExpense = async (e) => {
    e.preventDefault();
    if (!expenseForm.item || !expenseForm.amount) return;
    await addDoc(
      collection(db, "artifacts", currentGroupId, "public", "data", "expenses"),
      {
        item: expenseForm.item,
        amount: parseInt(expenseForm.amount),
        payer: userName,
        payerId: user.uid,
        category: expenseForm.category,
        timestamp: Date.now(),
        type: "adhoc",
      }
    );
    setShowExpenseModal(false);
  };

  const handleOpenItemCostModal = (e, item) => {
    e.stopPropagation();
    setItemCostForm({ id: item.id, name: item.name, amount: item.cost || "" });
    setShowItemCostModal(true);
  };

  const handleSubmitItemCost = async (e) => {
    e.preventDefault();
    await updateDoc(
      doc(
        db,
        "artifacts",
        currentGroupId,
        "public",
        "data",
        "items",
        itemCostForm.id
      ),
      { cost: parseInt(itemCostForm.amount) || 0 }
    );
    setShowItemCostModal(false);
  };

  // --- 計算 ---
  const poolItems = items.filter((item) =>
    selectedCategory === "全部" ? true : item.category === selectedCategory
  );
  const myItems = items.filter((item) => item.assignedName === userName);
  const myProgress =
    myItems.length === 0
      ? 0
      : Math.round(
          (myItems.filter((i) => i.isPacked).length / myItems.length) * 100
        );

  const itemExpenses = items
    .filter((i) => i.cost > 0 && i.assignedName)
    .map((i) => ({
      id: `item_${i.id}`,
      item: i.name,
      amount: i.cost,
      payer: i.assignedName,
      type: "item",
    }));
  const allExpenses = [...expenses, ...itemExpenses];
  const totalCost = allExpenses.reduce((sum, e) => sum + e.amount, 0);

  const payers = Array.from(
    new Set([...allExpenses.map((e) => e.payer), userName])
  );
  const splitMembers =
    uniqueParticipants.length > 0
      ? uniqueParticipants.map((p) => p.name)
      : payers.length > 0
      ? payers
      : [userName];
  const perPersonShare =
    splitMembers.length > 0 ? Math.round(totalCost / splitMembers.length) : 0;
  const myPaidTotal = allExpenses
    .filter((e) => e.payer === userName)
    .reduce((sum, e) => sum + e.amount, 0);
  const myBalance = myPaidTotal - perPersonShare;

  const settlementPlan = (() => {
    if (splitMembers.length < 2) return [];
    let balances = splitMembers.map((p) => ({
      name: p,
      balance:
        allExpenses
          .filter((e) => e.payer === p)
          .reduce((sum, e) => sum + e.amount, 0) - perPersonShare,
    }));
    let debtors = balances
      .filter((b) => b.balance < -1)
      .sort((a, b) => a.balance - b.balance);
    let creditors = balances
      .filter((b) => b.balance > 1)
      .sort((a, b) => b.balance - a.balance);
    const txs = [];
    let i = 0,
      j = 0;
    while (i < debtors.length && j < creditors.length) {
      let amt = Math.min(Math.abs(debtors[i].balance), creditors[j].balance);
      if (amt > 0)
        txs.push({
          from: debtors[i].name,
          to: creditors[j].name,
          amount: Math.round(amt),
        });
      debtors[i].balance += amt;
      creditors[j].balance -= amt;
      if (Math.abs(debtors[i].balance) < 1) i++;
      if (creditors[j].balance < 1) j++;
    }
    return txs;
  })();

  // --- Render ---
  if (view === "login")
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 font-sans">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white mb-4">
            <Tent className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-800 mb-6">CampSync</h1>
          <form onSubmit={handleLogin}>
            <input
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              placeholder="你的名字"
              className="w-full bg-slate-100 p-4 rounded-xl mb-4 font-bold outline-none focus:ring-2 ring-indigo-500"
              autoFocus
            />
            <button
              type="submit"
              disabled={!inputName.trim()}
              className="w-full bg-slate-900 text-white p-4 rounded-xl font-bold shadow-lg"
            >
              進入
            </button>
          </form>
        </div>
      </div>
    );

  if (view === "lobby")
    return (
      <div className="min-h-screen p-6 bg-slate-50 font-sans pb-24">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-sm font-bold text-slate-400">歡迎回來</h2>
            <h1 className="text-2xl font-black text-slate-800">{userName}</h1>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 bg-slate-200 rounded-full text-slate-600"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* 建立新團區塊 */}
        <div className="mb-8">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-600" /> 開新團 / 加入
            </h3>
            <div className="flex gap-2 mb-3">
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="輸入新團名..."
                className="flex-1 bg-slate-100 p-3 rounded-xl font-bold text-sm"
              />
              <button
                onClick={createNewGroup}
                className="bg-indigo-600 text-white px-4 rounded-xl font-bold text-sm whitespace-nowrap"
              >
                建立
              </button>
            </div>
          </div>
        </div>

        {/* 我的露營團 (歷史紀錄) */}
        {myGroups.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 ml-1">
              最近訪問
            </h3>
            <div className="space-y-3">
              {myGroups.map((group) => (
                <div
                  key={group.id}
                  onClick={() => enterGroup(group.id, group.name)}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center cursor-pointer hover:border-indigo-200 group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                      <MapIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">{group.name}</h4>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) =>
                        handleDeleteGroup(e, group.id, group.name)
                      }
                      className="p-2 text-slate-300 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 探索公開團 (Public Groups) */}
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 ml-1 flex items-center gap-1">
            <Globe className="w-3 h-3" /> 探索露營團 (可直接加入)
          </h3>
          {publicGroups.length === 0 ? (
            <div className="text-center py-8 text-slate-400 bg-slate-100 rounded-2xl border border-dashed border-slate-200">
              目前沒有公開的團
            </div>
          ) : (
            <div className="space-y-3">
              {publicGroups.map((group) => (
                <div
                  key={group.id}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center"
                >
                  <div>
                    <h4 className="font-bold text-slate-800">{group.name}</h4>
                    <p className="text-xs text-slate-400">ID: {group.id}</p>
                  </div>
                  <button
                    onClick={() => joinGroupFromList(group)}
                    className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl shadow-md"
                  >
                    加入
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {showJoinModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm p-6 rounded-3xl shadow-2xl">
              <h3 className="font-bold text-xl mb-6">新增露營團</h3>
              <div className="mb-6">
                <div className="flex gap-2">
                  <input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="團名"
                    className="flex-1 bg-slate-100 p-3 rounded-xl font-bold text-sm"
                  />
                  <button
                    onClick={createNewGroup}
                    className="bg-indigo-600 text-white px-4 rounded-xl font-bold text-sm"
                  >
                    建立
                  </button>
                </div>
              </div>
              <div className="relative my-6 text-center">
                <span className="relative bg-white px-3 text-xs text-slate-400 font-bold">
                  或輸入 ID
                </span>
              </div>
              <div className="mb-6">
                <div className="flex gap-2">
                  <input
                    value={joinInputId}
                    onChange={(e) => setJoinInputId(e.target.value)}
                    placeholder="輸入團體 ID"
                    className="flex-1 bg-slate-100 p-3 rounded-xl font-bold text-sm font-mono"
                  />
                  <button
                    onClick={joinGroup}
                    disabled={!joinInputId}
                    className="bg-slate-800 text-white px-4 rounded-xl font-bold text-sm disabled:opacity-50"
                  >
                    加入
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowJoinModal(false)}
                className="w-full py-3 bg-slate-100 rounded-xl font-bold text-slate-500"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    );

  return (
    <div className="min-h-screen font-sans text-slate-800 pb-32 bg-slate-50">
      <div className="sticky top-0 z-30 px-5 pt-6 pb-4 bg-white/80 backdrop-blur-xl shadow-sm">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div
              className="flex items-center gap-2 cursor-pointer opacity-70"
              onClick={leaveGroup}
            >
              <ArrowRightLeft className="w-4 h-4 rotate-180" />
              <h2 className="text-xs font-bold">回大廳</h2>
            </div>
            <h1 className="text-xl font-black text-slate-800 mt-1">
              {currentGroupName}
            </h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleSelectionMode}
              className={`p-2.5 rounded-full ${
                isSelectionMode
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              <CheckSquare className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2.5 rounded-full bg-slate-100 text-slate-600"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex bg-slate-200 p-1 rounded-full">
          {["pool", "mine", "cost"].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setIsSelectionMode(false);
                setSelectedItems(new Set());
              }}
              className={`flex-1 py-2 rounded-full text-xs font-bold transition-all ${
                activeTab === tab
                  ? "bg-white shadow text-indigo-600"
                  : "text-slate-500"
              }`}
            >
              {tab === "pool" ? "總裝備" : tab === "mine" ? "我的包" : "公費"}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-4 space-y-6">
        {isSelectionMode && (
          <div className="fixed bottom-24 left-5 right-5 z-40 bg-slate-900 text-white p-4 rounded-2xl flex justify-between items-center">
            <div className="font-bold flex gap-2">
              <CheckSquare className="w-5 h-5" /> {selectedItems.size} 項
            </div>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="px-3 py-1 bg-slate-700 rounded-lg text-xs"
              >
                全選
              </button>
              <button
                onClick={handleBatchDelete}
                className="px-3 py-1 bg-red-600 rounded-lg text-xs"
              >
                刪除
              </button>
            </div>
          </div>
        )}

        {activeTab === "pool" && (
          <>
            <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
              {BASE_TABS.concat(categories).map((cat, idx) => (
                <button
                  key={`${cat}-${idx}`}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border ${
                    selectedCategory === cat
                      ? "bg-slate-800 text-white"
                      : "bg-white text-slate-600"
                  }`}
                >
                  {cat}
                </button>
              ))}
              <button
                onClick={() => setShowCategoryModal(true)}
                className="px-2 py-1.5 rounded-full border border-dashed border-slate-300 text-slate-400"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              {poolItems.map((item) => {
                const isMine = item.assignedName === userName;
                return (
                  <div
                    key={item.id}
                    onClick={() =>
                      isSelectionMode && toggleItemSelection(item.id)
                    }
                    className={`bg-white p-4 rounded-2xl border relative ${
                      isSelectionMode && selectedItems.has(item.id)
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-100"
                    }`}
                  >
                    {isSelectionMode && (
                      <div
                        className={`absolute top-4 right-4 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                          selectedItems.has(item.id)
                            ? "bg-indigo-500 border-indigo-500"
                            : "border-slate-300"
                        }`}
                      >
                        {selectedItems.has(item.id) && (
                          <CheckCircle2 className="w-4 h-4 text-white" />
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-xl">
                        📦
                      </div>
                      <div className="flex-1">
                        <div className="flex gap-2 mb-1">
                          <span className="text-[10px] font-bold text-slate-400">
                            {item.category}
                          </span>
                          {item.cost > 0 && (
                            <span className="bg-emerald-100 text-emerald-700 px-1.5 rounded text-[10px] font-bold">
                              ${item.cost}
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold">{item.name}</h3>
                      </div>
                      {!isSelectionMode && (
                        <button
                          onClick={() => handleClaim(item)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                            isMine
                              ? "bg-red-50 text-red-500"
                              : item.assignedName
                              ? "bg-slate-100 text-slate-500"
                              : "bg-slate-900 text-white"
                          }`}
                        >
                          {isMine ? "放棄" : item.assignedName || "認領"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {activeTab === "mine" && (
          <>
            <div className="bg-indigo-600 text-white p-6 rounded-[32px] mb-6">
              <div className="flex justify-between items-end mb-2">
                <span className="text-xs font-bold">進度</span>
                <span className="text-3xl font-black">{myProgress}%</span>
              </div>
              <div className="h-2 bg-black/20 rounded-full">
                <div
                  className="h-full bg-white"
                  style={{ width: `${myProgress}%` }}
                />
              </div>
            </div>
            {myItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleTogglePacked(item)}
                className={`p-4 rounded-2xl border flex gap-4 ${
                  item.isPacked ? "bg-slate-50 opacity-60" : "bg-white"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    item.isPacked
                      ? "bg-emerald-500 border-emerald-500"
                      : "border-slate-200"
                  }`}
                >
                  {item.isPacked && (
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-bold">{item.name}</h4>
                  <button
                    onClick={(e) => handleOpenItemCostModal(e, item)}
                    className="mt-1 text-[10px] font-bold bg-slate-100 px-2 py-1 rounded-full flex gap-1 w-fit"
                  >
                    <Tag className="w-3 h-3" />{" "}
                    {item.cost > 0 ? `$${item.cost}` : "設定費用"}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === "cost" && (
          <>
            <div className="bg-slate-900 text-white p-6 rounded-[32px] text-center mb-6">
              <div className="text-xs font-bold mb-1">總支出</div>
              <div className="text-4xl font-black mb-2">${totalCost}</div>
              <div className="text-xs bg-white/10 px-3 py-1 rounded-full inline-block">
                {splitMembers.length} 人分攤: ${perPersonShare}
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border mb-6 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-400">團體 ID</span>
              <span className="font-mono font-bold bg-slate-100 px-2 py-1 rounded">
                {currentGroupId}
              </span>
            </div>
            {settlementPlan.map((tx, i) => (
              <div
                key={i}
                className="bg-white p-4 rounded-2xl border flex justify-between items-center mb-2"
              >
                <div className="text-sm font-bold flex gap-2">
                  <span className="bg-slate-100 px-2 rounded">{tx.from}</span>
                  <ArrowRight className="w-4 h-4" />
                  <span className="bg-slate-800 text-white px-2 rounded">
                    {tx.to}
                  </span>
                </div>
                <span className="font-black">${tx.amount}</span>
              </div>
            ))}
            <div className="space-y-3 mt-6">
              <h3 className="text-xs font-bold text-slate-400 ml-2">明細</h3>
              {allExpenses.map((exp) => (
                <div
                  key={exp.id}
                  onClick={() =>
                    isSelectionMode &&
                    exp.type !== "item" &&
                    toggleItemSelection(exp.id)
                  }
                  className={`bg-white p-4 rounded-2xl border flex justify-between items-center ${
                    isSelectionMode && selectedItems.has(exp.id)
                      ? "border-indigo-500"
                      : ""
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm">{exp.item}</div>
                    <div className="text-xs text-slate-400">{exp.payer}</div>
                  </div>
                  <div className="font-bold">${exp.amount}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {!isSelectionMode && activeTab === "pool" && (
        <button
          onClick={handleOpenAddItemModal}
          className="fixed bottom-8 right-6 w-auto px-6 h-14 rounded-full shadow-2xl flex items-center gap-2 justify-center text-white bg-slate-900 font-bold"
        >
          <Plus className="w-5 h-5" /> 新增物品
        </button>
      )}
      {!isSelectionMode && activeTab === "cost" && (
        <button
          onClick={handleOpenExpenseModal}
          className="fixed bottom-8 right-6 w-auto px-6 h-14 rounded-full shadow-2xl flex items-center gap-2 justify-center text-white bg-emerald-600 font-bold"
        >
          <Plus className="w-5 h-5" /> 新增支出
        </button>
      )}

      {/* Modals */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm p-6 rounded-3xl shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-xl">設定</h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-2 bg-slate-100 rounded-full"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="space-y-4">
              {uniqueParticipants.map((p) => (
                <div
                  key={p.id}
                  className="flex justify-between items-center p-3 border rounded-xl"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        p.isOnline ? "bg-green-500" : "bg-slate-300"
                      }`}
                    ></div>
                    <span className="font-bold text-sm">{p.name}</span>
                  </div>
                  <button
                    onClick={() => handleKickUser(p.name)}
                    className="text-red-500"
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="pt-4 border-t">
                <button
                  onClick={handleResetTrip}
                  className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-bold text-sm"
                >
                  重置資料
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm p-6 rounded-3xl shadow-2xl">
            <h3 className="font-bold text-xl mb-4">分類管理</h3>
            <div className="flex gap-2 mb-4">
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="新分類"
                className="flex-1 bg-slate-100 p-3 rounded-xl font-bold"
              />
              <button
                onClick={handleAddCategory}
                className="bg-indigo-600 text-white px-4 rounded-xl font-bold"
              >
                新增
              </button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {categories.map((cat) => (
                <div
                  key={cat}
                  className="flex justify-between p-3 border rounded-xl"
                >
                  <span className="font-bold">{cat}</span>
                  {!DEFAULT_CATEGORIES.includes(cat) && (
                    <button
                      onClick={() => handleDeleteCategory(cat)}
                      className="text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowCategoryModal(false)}
              className="w-full mt-4 py-3 bg-slate-100 rounded-xl font-bold text-slate-500"
            >
              關閉
            </button>
          </div>
        </div>
      )}

      {showAddItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40">
          <div className="bg-white w-full max-w-sm p-6 rounded-3xl">
            <h3 className="font-bold text-xl mb-4">新增物品</h3>
            <input
              className="w-full bg-slate-50 p-4 rounded-xl mb-3"
              placeholder="名稱"
              value={newItemForm.name}
              onChange={(e) =>
                setNewItemForm({ ...newItemForm, name: e.target.value })
              }
            />
            <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() =>
                    setNewItemForm({ ...newItemForm, category: c })
                  }
                  className={`px-3 py-1 rounded border text-xs font-bold ${
                    newItemForm.category === c ? "bg-slate-800 text-white" : ""
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <button
              onClick={handleSubmitNewItem}
              className="w-full bg-slate-900 text-white p-4 rounded-xl font-bold"
            >
              新增
            </button>
            <button
              onClick={() => setShowAddItemModal(false)}
              className="w-full mt-2 py-3 text-slate-400 font-bold"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40">
          <div className="bg-white w-full max-w-sm p-6 rounded-3xl">
            <h3 className="font-bold text-xl mb-4">新增支出</h3>
            <input
              className="w-full bg-slate-50 p-4 rounded-xl mb-3"
              placeholder="項目"
              value={expenseForm.item}
              onChange={(e) =>
                setExpenseForm({ ...expenseForm, item: e.target.value })
              }
            />
            <input
              className="w-full bg-slate-50 p-4 rounded-xl mb-4"
              type="number"
              placeholder="金額"
              value={expenseForm.amount}
              onChange={(e) =>
                setExpenseForm({ ...expenseForm, amount: e.target.value })
              }
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowExpenseModal(false)}
                className="flex-1 bg-slate-100 p-3 rounded-xl font-bold"
              >
                取消
              </button>
              <button
                onClick={handleSubmitExpense}
                className="flex-1 bg-emerald-600 text-white p-3 rounded-xl font-bold"
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      )}
      {showItemCostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40">
          <div className="bg-white w-full max-w-sm p-6 rounded-3xl">
            <h3 className="font-bold text-xl mb-4">設定費用</h3>
            <input
              className="w-full bg-slate-50 p-4 rounded-xl mb-4 text-xl"
              type="number"
              value={itemCostForm.amount}
              onChange={(e) =>
                setItemCostForm({ ...itemCostForm, amount: e.target.value })
              }
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowItemCostModal(false)}
                className="flex-1 bg-slate-100 p-3 rounded-xl font-bold"
              >
                取消
              </button>
              <button
                onClick={handleSubmitItemCost}
                className="flex-1 bg-indigo-600 text-white p-3 rounded-xl font-bold"
              >
                確認
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-8 left-0 right-0 px-6 z-50 flex justify-center">
          <div className="bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3">
            {toast.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
            )}{" "}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
