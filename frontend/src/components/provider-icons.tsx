// Agent provider panel icons — Lucide.
import { Bot, Check, KeyRound, Sparkles } from 'lucide-solid'

export const RobotIcon = (props: { size?: number }) => <Bot size={props.size ?? 14} aria-hidden="true" />

export const SparkIcon = (props: { size?: number }) => <Sparkles size={props.size ?? 14} aria-hidden="true" />

export const KeyIcon = (props: { size?: number }) => <KeyRound size={props.size ?? 14} aria-hidden="true" />

export const CheckIcon = (props: { size?: number }) => <Check size={props.size ?? 14} aria-hidden="true" />
