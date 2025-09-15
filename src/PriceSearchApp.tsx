import { MessageSquare, Search, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// Interfaces para tipar los datos
interface ItemTienda {
    Tienda: string;
    Precio: number;
    Fecha: string;
}

interface Item {
    Producto: string;
    Marca: string;
    Tamaño: string;
    Unidad: string;
    ÍtemsTiendas?: ItemTienda[];
}

interface SearchResponse {
    Resultado: string;
    Mensaje?: string;
    Datos?: {
        Ítems?: Item[];
    };
}

interface Message {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    isLoading?: boolean;
    tool_calls?: { function: { name: string; arguments: string } }[];
    tool_call_id?: string;
}

const MistralPriceSearchApp = () => {
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'system',
            content: 'Eres un asistente experto en precios de productos de supermercados. Cuando un usuario pregunte por el precio, debes extraer el nombre del producto y, si se menciona un municipio (por ejemplo, \'Bogotá\', \'Medellín\', \'Cali\', \'Barranquilla\'), convertir ese municipio en su ID correspondiente (Bogotá=1, Medellín=2, Cali=3, Barranquilla=4) y ejecutar la función \'buscar_precios\' con esos parámetros.'
        },
        {
            role: 'assistant',
            content: 'Hola, soy un asistente para consultar precios de productos en Colombia. ¿Qué producto te gustaría consultar?'
        }
    ]);
    const [input, setInput] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const endOfMessagesRef = useRef<HTMLDivElement | null>(null);

    // Claves API
    // Las claves se leen desde variables de entorno definidas en .env (Vite)
    const MISTRAL_API_KEY: string = import.meta.env.VITE_MISTRAL_API_KEY || "";
    const LOSPRECIOS_API_KEY: string = import.meta.env.VITE_LOSPRECIOS_API_KEY || "";
    const MODEL: string = "mistral-large-latest";

    // Definición de la herramienta
    const tool = {
        name: "buscar_precios",
        description: "Busca precios de productos en Colombia usando losprecios.co",
        parameters: {
            type: "object",
            properties: {
                termino: { type: "string" },
                municipio_id: { type: "integer" }
            },
            required: ["termino"]
        }
    };

    const scrollToBottom = (): void => {
        endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Función para buscar precios desde la API
    const searchPrices = async (termino: string, municipio_id: number | null = null): Promise<SearchResponse> => {
        try {
            const url = new URL('https://losprecios.co/buscar/resultado');

            // Agregar parámetros
            const params: Record<string, string> = {
                'ClaveAPI': LOSPRECIOS_API_KEY,
                'Término': termino,
                'Tipo': 'Ítem'
            };

            if (municipio_id) {
                params['MunicipioID'] = municipio_id.toString();
            }

            // Agregar todos los parámetros a la URL
            Object.keys(params).forEach(key =>
                url.searchParams.append(key, params[key])
            );

            const response = await fetch(url);
            return await response.json();
        } catch (error) {
            console.error('Error searching prices:', error);
            return { Resultado: 'Error', Mensaje: 'Error al buscar precios' };
        }
    };

    // Función para formatear los resultados de búsqueda
    const formatResults = (data: SearchResponse): string => {
        if (data.Resultado !== 'Ok' || !data.Datos?.Ítems?.length) {
            return "❌ No se encontraron resultados para tu búsqueda.";
        }

        let response = "";
        for (const item of data.Datos.Ítems) {
            response += `\n🔹 ${item.Producto} - ${item.Marca} (${item.Tamaño} ${item.Unidad})\n`;

            if (item.ÍtemsTiendas && item.ÍtemsTiendas.length) {
                for (const tienda of item.ÍtemsTiendas) {
                    const precio = `$${parseInt(tienda.Precio.toString()).toLocaleString('es-CO')}`;
                    response += `   🛒 ${tienda.Tienda} ➜ ${precio} COP [${tienda.Fecha}]\n`;
                }
            } else {
                response += "   ⚠️ No hay precios disponibles para este ítem en el municipio seleccionado.\n";
            }
        }
        return response;
    };

    // Llamada a la API de Mistral
    const callMistralAPI = async (messagesForAPI: Message[]): Promise<{ choices: { message: Message }[] }> => {
        try {
            const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${MISTRAL_API_KEY}`
                },
                body: JSON.stringify({
                    model: MODEL,
                    messages: messagesForAPI.map(msg => ({
                        role: msg.role,
                        content: msg.content,
                        tool_calls: msg.tool_calls,
                        tool_call_id: msg.tool_call_id
                    })),
                    tools: [tool]
                })
            });

            return await response.json();
        } catch (error) {
            console.error('Error calling Mistral API:', error);
            throw error;
        }
    };

    const handleSendMessage = async (): Promise<void> => {
        if (!input.trim()) return;

        // Agregar mensaje del usuario
        const userMessage: Message = { role: 'user', content: input, tool_calls: undefined };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        try {
            // Filtrar mensajes para la API de Mistral (eliminar isLoading y mensajes visuales)
            const messagesForAPI = messages
                .filter(msg => !msg.isLoading)
                .map(({ role, content, tool_calls, tool_call_id }) => ({
                    role, content, tool_calls, tool_call_id
                }));

            messagesForAPI.push({ ...userMessage, tool_calls: undefined, tool_call_id: undefined });

            // Añadir mensaje de carga mientras esperamos la respuesta
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Pensando...',
                isLoading: true
            }]);

            // Primera llamada a Mistral para procesar la solicitud
            const mistralResponse = await callMistralAPI(messagesForAPI);
            const assistantMessage = mistralResponse.choices[0].message;

            // Reemplazar mensaje de carga con respuesta real
            setMessages(prev => [
                ...prev.slice(0, -1),
                {
                    role: 'assistant',
                    content: assistantMessage.content || '',
                    tool_calls: assistantMessage.tool_calls
                }
            ]);

            // Si Mistral quiere usar una herramienta
            if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
                const toolCall = assistantMessage.tool_calls[0];

                if (toolCall.function.name === 'buscar_precios') {
                    // Parsear argumentos
                    const args = JSON.parse(toolCall.function.arguments);
                    const termino = args.termino;
                    const municipio_id = args.municipio_id;

                    // Añadir mensaje de carga mientras buscamos los precios
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: 'Buscando precios...',
                        isLoading: true
                    }]);

                    // Ejecutar la búsqueda
                    const searchResult = await searchPrices(termino, municipio_id);
                    const formattedResult = formatResults(searchResult);

                    // Añadir resultado de la herramienta
                    const toolResponseMessage: Message = {
                        role: 'tool',
                        content: formattedResult + ". Por favor, usa la información anterior y dime los precios del producto, si no, dame información general del producto que encuentres.",
                        tool_call_id: undefined
                    };

                    // Actualizar mensajes con respuesta de la herramienta
                    setMessages(prev => [
                        ...prev.slice(0, -1), // Quitar mensaje de carga
                        {
                            role: 'assistant',
                            content: assistantMessage.content || '',
                            tool_calls: assistantMessage.tool_calls
                        },
                        toolResponseMessage
                    ]);

                    // Preparar mensajes para la segunda llamada a Mistral
                    const updatedMessagesForAPI: Message[] = [
                        ...messagesForAPI,
                        {
                            role: 'assistant',
                            content: assistantMessage.content || '',
                            tool_calls: assistantMessage.tool_calls,
                            tool_call_id: undefined
                        },
                        {
                            role: toolResponseMessage.role as 'tool',
                            content: toolResponseMessage.content,
                            tool_calls: toolResponseMessage.tool_calls,
                            tool_call_id: toolResponseMessage.tool_call_id
                        }
                    ];

                    // Segunda llamada a Mistral para procesar los resultados
                    const finalResponse = await callMistralAPI(updatedMessagesForAPI);
                    const finalAssistantMessage = finalResponse.choices[0].message;

                    // Añadir la respuesta final
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: finalAssistantMessage.content || ''
                    }]);
                }
            }
        } catch (error) {
            console.error('Error in message flow:', error);
            setMessages(prev => [
                ...prev.slice(0, -1), // Quitar mensaje de carga
                {
                    role: 'assistant',
                    content: 'Lo siento, ocurrió un error al procesar tu solicitud.'
                }
            ]);
        } finally {
            setLoading(false);
        }
    };

    // Para renderizar los mensajes (excepto el mensaje del sistema)
    const renderMessages = messages.filter(msg => msg.role !== 'system');

    return (
        <div className="flex flex-col h-screen bg-gray-100">
            <header className="bg-blue-600 text-white p-4 shadow-md">
                <div className="flex items-center justify-center">
                    <MessageSquare className="mr-2" />
                    <h1 className="text-xl font-bold">Buscador de Precios con Mistral AI</h1>
                </div>
            </header>

            <main className="flex-1 overflow-auto p-4 pb-20">
                <div className="max-w-3xl mx-auto">
                    {renderMessages.map((msg, index) => (
                        <div
                            key={index}
                            className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`p-3 rounded-lg max-w-xs sm:max-w-md md:max-w-lg ${msg.role === 'user'
                                    ? 'bg-blue-500 text-white'
                                    : msg.role === 'tool'
                                        ? 'bg-green-100 text-gray-800 shadow'
                                        : 'bg-white text-gray-800 shadow'
                                    }`}
                            >
                                {msg.isLoading ? (
                                    <div className="flex items-center">
                                        <div className="animate-pulse mr-2">⏳</div>
                                        {msg.content}
                                    </div>
                                ) : (
                                    <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                                )}
                            </div>
                        </div>
                    ))}
                    <div ref={endOfMessagesRef} />
                </div>
            </main>

            <footer className="bg-white border-t p-4 fixed bottom-0 w-full">
                <div className="max-w-3xl mx-auto flex items-center">
                    <Search className="text-gray-400 mr-2" />
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Pregunta por el precio de un producto..."
                        className="flex-1 p-2 border rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={loading}
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={loading || !input.trim()}
                        className="bg-blue-600 text-white p-2 rounded-r-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-300"
                    >
                        {loading ? (
                            <div className="animate-spin h-5 w-5">⏳</div>
                        ) : (
                            <Send size={20} />
                        )}
                    </button>
                </div>
            </footer>
        </div>
    );
};

export default MistralPriceSearchApp;