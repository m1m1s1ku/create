export interface SubmenuItem {
	label?: string;
	click?: () => void; 
	type?: string;
	accelerator?: string | boolean;
	role?: string;
	submenu?: { role: string; }[];
}

export interface MenuItemRebrand {
	label?: string;
	role?: string;
	submenu: SubmenuItem[];
}

export interface Service {
	host: string;
	port: string;
	name: string;
	manual: boolean;
	fullname: string | number; 
	addresses: string[]; 
	txt: Record<string, string>;
}

export interface Product {
	fullname: string | number;
	addresses: string[];
	host: string;
	port: string;
	name: string;
	modelID: string | null;
	modelName: string | null;
	productImage: string | null;
	systemID: string | null;
	systemStatus: string | null;
	boundTo: string | undefined;
	manual: boolean;
	txt: Record<string, string>;
}
