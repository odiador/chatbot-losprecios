// types.ts
export interface ItemTienda {
    Tienda: string;
    Precio: number;
    Fecha: string;
}

export interface Item {
    Producto: string;
    Marca: string;
    Tamaño: string;
    Unidad: string;
    ÍtemsTiendas?: ItemTienda[];
}

export interface SearchResponse {
    Resultado: string;
    Mensaje?: string;
    Datos?: {
        Ítems?: Item[];
    };
}

export interface Message {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    isLoading?: boolean;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
}

export interface ToolCall {
    id: string;
    function: {
        name: string;
        arguments: string;
    };
}

export interface MistralResponse {
    choices: Array<{
        message: {
            role: string;
            content: string | null;
            tool_calls?: ToolCall[];
        };
    }>;
}

export interface PriceSearchToolParams {
    termino: string;
    municipio_id?: number | null;
}