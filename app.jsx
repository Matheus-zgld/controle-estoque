import React, { useState, useEffect, useMemo } from 'react';
import {
    Plus,
    Minus,
    Calendar as CalendarIcon,
    Trash2,
    Package,
    TrendingUp,
    TrendingDown,
    Cloud,
    History,
    CheckCircle2
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import {
    getAuth,
    signInAnonymously,
    signInWithCustomToken,
    onAuthStateChanged
} from 'firebase/auth';
import {
    getFirestore,
    collection,
    doc,
    onSnapshot,
    addDoc,
    deleteDoc
} from 'firebase/firestore';

// --- CONFIGURAÇÃO FIREBASE ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'controle-pecas-mae';

const App = () => {
    const [user, setUser] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    // Estados do Formulário
    const [qtd, setQtd] = useState('');
    const [obs, setObs] = useState('');
    const [data, setData] = useState(new Date().toISOString().split('T')[0]);

    // 1. Autenticação (Obrigatório para Firestore)
    useEffect(() => {
        const initAuth = async () => {
            try {
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    await signInWithCustomToken(auth, __initial_auth_token);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (err) {
                console.error("Erro na autenticação:", err);
            }
        };
        initAuth();
        const unsubscribe = onAuthStateChanged(auth, setUser);
        return () => unsubscribe();
    }, []);

    // 2. Escutar Dados em Tempo Real
    useEffect(() => {
        if (!user) return;

        // Caminho seguindo a REGRA 1: /artifacts/{appId}/public/data/{collectionName}
        const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'movimentacoes');

        const unsubscribe = onSnapshot(colRef, (snapshot) => {
            const dataList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Ordenação manual para evitar necessidade de índices compostos no Firestore
            const sorted = dataList.sort((a, b) => {
                const dateA = new Date(a.data).getTime();
                const dateB = new Date(b.data).getTime();
                if (dateB !== dateA) return dateB - dateA;
                return (b.timestamp || 0) - (a.timestamp || 0);
            });

            setTransactions(sorted);
            setLoading(false);
        }, (error) => {
            console.error("Erro ao buscar dados:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    // Adicionar Nova Peça ou Venda
    const handleAdd = async (tipo) => {
        if (!qtd || qtd <= 0 || !user) return;

        const valorFinal = tipo === 'entrada' ? Number(qtd) : -Number(qtd);
        const labelPadrao = tipo === 'entrada' ? 'Produção Própria' : 'Venda Realizada';

        try {
            const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'movimentacoes');
            await addDoc(colRef, {
                data,
                descricao: obs || labelPadrao,
                valor: valorFinal,
                timestamp: Date.now()
            });
            setQtd('');
            setObs('');
            // Feedback visual simples: o sistema atualiza sozinho via onSnapshot
        } catch (err) {
            console.error("Erro ao salvar no banco:", err);
        }
    };

    const apagarRegistro = async (id) => {
        try {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'movimentacoes', id);
            await deleteDoc(docRef);
        } catch (err) {
            console.error("Erro ao apagar:", err);
        }
    };

    // Cálculos Automáticos para o Resumo
    const stats = useMemo(() => {
        const totalEstoque = transactions.reduce((acc, t) => acc + t.valor, 0);

        const agrupadoMes = transactions.reduce((acc, t) => {
            const mesAno = t.data.substring(0, 7); // Formato "YYYY-MM"
            if (!acc[mesAno]) acc[mesAno] = { total: 0, produzidas: 0, vendidas: 0 };
            acc[mesAno].total += t.valor;
            if (t.valor > 0) acc[mesAno].produzidas += t.valor;
            else acc[mesAno].vendidas += Math.abs(t.valor);
            return acc;
        }, {});

        return { totalEstoque, agrupadoMes };
    }, [transactions]);

    const listaMeses = Object.keys(stats.agrupadoMes).sort().reverse();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-sky-50">
                <div className="flex flex-col items-center gap-4 text-sky-600">
                    <Package className="animate-bounce" size={48} />
                    <p className="font-bold">Carregando estoque...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-sky-50 font-sans text-slate-800 pb-12">
            {/* Cabeçalho */}
            <div className="bg-white rounded-b-[3rem] shadow-sm p-8 mb-6 border-b border-sky-100">
                <div className="max-w-md mx-auto text-center">
                    <h1 className="text-2xl font-black text-sky-700 flex items-center justify-center gap-2 italic">
                        Controle de Peças 🌸
                    </h1>

                    <div className="mt-8 bg-gradient-to-br from-sky-500 to-indigo-600 rounded-3xl p-8 shadow-xl shadow-sky-200">
                        <span className="text-sky-100 text-xs font-bold uppercase tracking-widest">Estoque Hoje</span>
                        <div className="text-6xl font-black text-white mt-2 leading-none">
                            {stats.totalEstoque}
                        </div>
                        <p className="text-sky-200 text-sm mt-3 font-medium">peças prontas para venda</p>
                    </div>
                </div>
            </div>

            <div className="max-w-md mx-auto px-4 space-y-6">

                {/* Painel de Entrada de Dados */}
                <div className="bg-white p-6 rounded-[2.5rem] shadow-lg border border-sky-50">
                    <h2 className="text-lg font-bold mb-5 text-slate-600 flex items-center gap-2">
                        <Plus size={20} className="text-sky-500" /> Registrar Movimento
                    </h2>

                    <div className="space-y-5">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase mb-1 block tracking-wider">Quantidade</label>
                            <input
                                type="number"
                                inputMode="numeric"
                                placeholder="Ex: 5"
                                value={qtd}
                                onChange={(e) => setQtd(e.target.value)}
                                className="w-full text-3xl font-bold p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-sky-400 outline-none transition-all text-center"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => handleAdd('entrada')}
                                className="bg-emerald-500 text-white p-5 rounded-2xl font-black shadow-lg shadow-emerald-100 active:scale-95 transition-transform flex flex-col items-center gap-2"
                            >
                                <TrendingUp size={28} />
                                <span>FIZ PEÇAS</span>
                            </button>
                            <button
                                onClick={() => handleAdd('saida')}
                                className="bg-rose-500 text-white p-5 rounded-2xl font-black shadow-lg shadow-rose-100 active:scale-95 transition-transform flex flex-col items-center gap-2"
                            >
                                <TrendingDown size={28} />
                                <span>VENDI</span>
                            </button>
                        </div>

                        <button
                            onClick={() => {
                                const el = document.getElementById('config-extra');
                                el.classList.toggle('hidden');
                            }}
                            className="w-full py-2 text-xs font-bold text-slate-400 hover:text-sky-500 transition-colors uppercase tracking-widest"
                        >
                            Opções Extras (Data/Descrição)
                        </button>

                        <div id="config-extra" className="hidden space-y-4 pt-4 border-t border-slate-100">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 ml-1 uppercase block mb-1">Data</label>
                                <input
                                    type="date"
                                    value={data}
                                    onChange={(e) => setData(e.target.value)}
                                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl font-medium"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 ml-1 uppercase block mb-1">O que foi? (Opcional)</label>
                                <input
                                    type="text"
                                    placeholder="Ex: Encomenda da Joana"
                                    value={obs}
                                    onChange={(e) => setObs(e.target.value)}
                                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl font-medium"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Resumo de Meses */}
                <div className="bg-white rounded-[2rem] shadow-lg border border-sky-50 overflow-hidden">
                    <div className="p-5 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-black text-slate-500 text-xs tracking-widest uppercase flex items-center gap-2">
                            <CalendarIcon size={16} /> Resumo Mensal
                        </h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {listaMeses.map(mesAno => {
                            const [ano, mes] = mesAno.split('-');
                            const dataObj = new Date(ano, mes - 1);
                            const nomeMes = dataObj.toLocaleDateString('pt-BR', { month: 'long' });
                            const mStats = stats.agrupadoMes[mesAno];

                            return (
                                <div key={mesAno} className="p-5 flex justify-between items-center hover:bg-sky-50/30 transition-colors">
                                    <div>
                                        <p className="font-bold text-slate-800 capitalize text-lg leading-none">{nomeMes} <span className="text-slate-300 font-normal">{ano}</span></p>
                                        <div className="mt-2 flex gap-3 text-[10px] font-bold uppercase tracking-tight">
                                            <span className="text-emerald-500">Entrou: {mStats.produzidas}</span>
                                            <span className="text-rose-400 font-normal">|</span>
                                            <span className="text-rose-500">Saiu: {mStats.vendidas}</span>
                                        </div>
                                    </div>
                                    <div className={`text-2xl font-black ${mStats.total >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {mStats.total > 0 ? '+' : ''}{mStats.total}
                                    </div>
                                </div>
                            );
                        })}
                        {listaMeses.length === 0 && (
                            <div className="p-10 text-center">
                                <Package size={32} className="mx-auto text-slate-200 mb-2" />
                                <p className="text-slate-400 text-sm italic">Nenhum registro encontrado.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Histórico das Últimas Ações */}
                <div className="bg-white rounded-[2rem] shadow-lg border border-sky-50 overflow-hidden">
                    <div className="p-5 bg-slate-50/50 border-b border-slate-100">
                        <h3 className="font-black text-slate-500 text-xs tracking-widest uppercase flex items-center gap-2">
                            <History size={16} /> Últimos Lançamentos
                        </h3>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                        {transactions.map((t) => (
                            <div key={t.id} className="p-4 flex items-center justify-between group">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${t.valor >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                        {t.valor >= 0 ? <Plus size={20} /> : <Minus size={20} />}
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-700 leading-tight">{t.descricao}</p>
                                        <p className="text-[10px] text-slate-400 font-medium">{new Date(t.data + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`text-lg font-black ${t.valor >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {t.valor > 0 ? '+' : ''}{t.valor}
                                    </span>
                                    <button
                                        onClick={() => apagarRegistro(t.id)}
                                        className="p-2 text-slate-200 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Rodapé de Status */}
                <div className="flex flex-col items-center gap-2 pb-6">
                    <div className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest">
                        <CheckCircle2 size={14} /> Sistema Online & Seguro
                    </div>
                    <p className="text-[9px] text-slate-300 uppercase font-bold tracking-[0.2em]">Salvamento automático via nuvem</p>
                </div>

            </div>
        </div>
    );
};

export default App;