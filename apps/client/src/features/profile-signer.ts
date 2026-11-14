import {createContext} from 'react';
import type {ReportSigner} from '@archforms/domain';

export const ProfileSignerContext=createContext<ReportSigner|undefined>(undefined);
